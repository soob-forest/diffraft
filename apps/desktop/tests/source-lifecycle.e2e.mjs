import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  chooseTask,
  conversation,
  createTask,
  terminal,
} from "./support/generation-fixture.mjs";
import { editor, prepare, root } from "./support/review-fixture.mjs";
import { selectSource } from "./support/source-ui.mjs";

const form = ".source-selection-panel";
const firstLine = "출발 시간과 이동 경로를 함께 기록합니다.";
const failureLine = "준비가 늦어지면 진행 상황을 공유합니다.";
const lastLine = "완료한 준비는 출발 전에 확인합니다.";
const instruction = "원문 요청의 지시를 보존합니다";
let fixture, secondTask;

describe("원문 요청의 수명과 작업 소유자", () => {
  before(async () => {
    await mkdir(".artifacts/source-lifecycle", { recursive: true });
    fixture = await prepare("review");
    secondTask = await createTask("다른 작업의 화면 유지");
    await chooseTask(fixture.task.id);
  });
  beforeEach(async () => {
    await $("button=변경 검토").click();
    await chooseTask(fixture.task.id);
  });
  afterEach(async function () {
    if (this.currentTest.state === "failed")
      await browser.saveScreenshot(".artifacts/source-lifecycle/failure.png");
    if ((await conversation(fixture.task.id)).lastAttempt?.status === "RUNNING")
      await terminal(fixture.task.id);
    const panel = $(form);
    if (!(await panel.isExisting()) || !(await panel.isDisplayed())) return;
    const close = panel.$("button=원문으로 돌아가기");
    await close.waitForEnabled();
    await close.click();
  });
  it("작업을 바꾸면 빈 작성창을 닫고 A의 초안과 대상 변경 안내를 구분한다", async () => {
    await sourceDraft(firstLine);
    await selectSource(failureLine, true);
    await $(".document-main > .selection-context button").click();
    await $(form)
      .$("button=기존 초안 보관하고 새 대상 작성")
      .waitForDisplayed();
    await $("button=변경 검토").click();
    await chooseTask(secondTask);
    await $("button=원문").click();
    assert.equal(await $(form).isExisting(), false);
    await $(".request-form textarea").waitForDisplayed();
    await $("button=변경 검토").click();
    await chooseTask(fixture.task.id);
    await $("button=원문").click();
    await $(".source-draft-resume").click();
    assert.equal(await $(`${form} textarea`).getValue(), instruction);
    assert.equal(
      await $(form).$("button=기존 초안 보관하고 새 대상 작성").isExisting(),
      false,
    );
    assert.equal((await $(`${form} .quote-text`).getText()).trim(), "출발 시");
  });
  it("요청 중 보기 왕복에도 잠금을 유지하고 성공하면 정확한 새 제안으로 이동한다", async () => {
    await sourceDraft(firstLine);
    const request = await start("REGENERATE_DELAY");
    await roundTrip();
    assert.equal(
      (await conversation(fixture.task.id)).lastAttempt.status,
      "RUNNING",
    );
    assert.equal(await $(form).$("button=확인 후 요청").isEnabled(), false);
    assert.equal(await $(form).$("button=지시로 돌아가기").isEnabled(), false);
    const page = await terminal(fixture.task.id, request.previousJob);
    assert.equal(page.lastAttempt.status, "SUCCEEDED");
    await $(".current-result-notice").waitForDisplayed();
    assert.equal(await $(form).isExisting(), false);
    await assertOriginal();
    await settleStatus();
    await browser.saveScreenshot(".artifacts/source-lifecycle/completed.png");
  });
  it("실패 응답이 보기 왕복 뒤 도착해도 오류와 지시를 유지해 다시 준비할 수 있다", async () => {
    await sourceDraft(failureLine);
    const request = await start("MALFORMED_DELAY");
    await roundTrip();
    const page = await terminal(fixture.task.id, request.previousJob);
    assert.equal(page.lastAttempt.status, "FAILED");
    await $(`${form} textarea`).waitForEnabled();
    assert.equal(await $(`${form} textarea`).getValue(), instruction);
    await $(`${form} > p[role=status]`).waitForDisplayed();
    assert.ok((await $(`${form} > p[role=status]`).getText()).trim());
    await $(`${form} button[type=submit]`).waitForEnabled();
    await assertOriginal();
    await settleStatus();
    await browser.saveScreenshot(".artifacts/source-lifecycle/failed.png");
  });
  it("A 요청 중 B로 이동하면 A의 늦은 성공이 B의 화면을 바꾸지 않는다", async () => {
    await sourceDraft(lastLine);
    const request = await start("REGENERATE_DELAY");
    await $("button=변경 검토").click();
    await chooseTask(secondTask);
    await $("button=원문").click();
    const page = await terminal(fixture.task.id, request.previousJob);
    assert.equal(page.lastAttempt.status, "SUCCEEDED");
    await browser.waitUntil(async () =>
      (await $("footer .draft-status").getText()).includes("저장됨"),
    );
    assert.equal(await $(".task-picker select").getValue(), secondTask);
    assert.equal(await $("button=원문").getAttribute("aria-pressed"), "true");
    assert.equal(await $(form).isExisting(), false);
    await assertOriginal();
  });
});

async function sourceDraft(text) {
  await $("button=원문").click();
  await selectSource(text, true);
  await $(".document-main > .selection-context button").click();
  const replacement = $(form).$("button=기존 초안 보관하고 새 대상 작성");
  if (await replacement.isExisting()) await replacement.click();
  await $(`${form} textarea`).waitForDisplayed();
  await $(`${form} textarea`).setValue(instruction);
}
async function start(mode) {
  const previousJob = (await conversation(fixture.task.id)).lastAttempt?.jobId;
  await $(`${form} button[type=submit]`).waitForEnabled();
  await $(`${form} button[type=submit]`).click();
  await $(`${form} .selection-confirmation`).waitForDisplayed();
  await writeFile(join(root, "next-generation"), mode);
  await $(form).$("button=확인 후 요청").click();
  await browser.waitUntil(
    async () =>
      (await conversation(fixture.task.id)).lastAttempt?.status === "RUNNING",
  );
  return { previousJob };
}
async function roundTrip() {
  await $("button=변경 검토").click();
  await $("button=원문").click();
  await $(form).waitForDisplayed();
}
async function assertOriginal() {
  const state = await editor({ kind: "read", documentId: fixture.document.id });
  assert.equal(state.document.content, fixture.base);
  assert.equal(state.document.versionId, fixture.batch.applyHeadId);
}
async function settleStatus() {
  await browser.waitUntil(
    async () =>
      (await $("footer .draft-status").getText()).includes("저장됨") &&
      (await $(".generation-status").getText()).trim() === "",
  );
}
