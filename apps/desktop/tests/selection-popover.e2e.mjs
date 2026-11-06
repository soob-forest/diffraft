import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createTask, terminal } from "./support/generation-fixture.mjs";
import { editor, invoke, prepare, root } from "./support/review-fixture.mjs";
import { chooseGroup } from "./support/review-ui.mjs";
import { selectSource } from "./support/source-ui.mjs";
import {
  foregroundUnitDisplay,
  readUnitDisplayState,
} from "./support/unit-review-display.mjs";
import { selectDiffText } from "./support/ux-ui.mjs";

let fixture;
async function send(mode) {
  await $(".source-selection-panel").$("button=요청 내용 확인").click();
  await $(".source-selection-panel .selection-confirmation").waitForDisplayed();
  assert.equal(await $(".source-selection-panel textarea").isExisting(), false);
  await browser.saveScreenshot(
    ".artifacts/selection-popover/source-confirm.png",
  );
  await writeFile(join(root, "next-generation"), mode);
  await $(".source-selection-panel").$("button=확인 후 요청").click();
}
async function diffActions() {
  await mkdir(".artifacts/selection-popover", { recursive: true });
  fixture = await prepare("review");
  await chooseGroup(1);
  const proposal = fixture.batch.proposals.find((value) =>
    value.operation.headingPath.at(-1).startsWith("1."),
  );
  await selectDiffText(proposal.operation.after);
  await $(".selection-context").$("button=이 부분 수정").waitForDisplayed();
  assert.equal(await $$(".review-tools .selection-request-entry").length, 0);
  assert.equal(
    await $(".selection-context .selection-primary").getText(),
    "이 부분 수정",
  );
  await browser.saveScreenshot(".artifacts/selection-popover/diff-actions.png");
  await $(".selection-context").$("button=코멘트").click();
  await $(".comment-form:not([hidden]) textarea").waitForDisplayed();
  assert.equal(
    (await $(".comment-form:not([hidden]) .quote-text").getText()).trim(),
    proposal.operation.after.slice(0, 3).trim(),
  );
  await $(".comment-form:not([hidden])").$("button=변경 상세").click();
}
async function sourceFailure() {
  await $("button=원문").click();
  await selectSource("출발 시간과 이동 경로를 함께 기록합니다.");
  assert.equal(await $(".scope-bar select").getValue(), "whole");
  await browser.saveScreenshot(
    ".artifacts/selection-popover/source-actions.png",
  );
  await $(".selection-context").$("button=이 부분 수정").click();
  await $(".source-selection-panel textarea").waitForEnabled();
  assert.equal(
    (await $(".source-selection-panel .quote-text").getText()).trim(),
    "출발 시",
  );
  await $(".source-selection-panel textarea").setValue("이 세 글자만 다듬기");
  assert.equal(await $(".source-pinned-selection").isExisting(), true);
  await send("malformed");
  assert.equal((await terminal(fixture.task.id)).lastAttempt.status, "FAILED");
  assert.equal(
    await $(".source-selection-panel textarea").getValue(),
    "이 세 글자만 다듬기",
  );
  await assertActiveBatches(1);
  await browser.saveScreenshot(
    ".artifacts/selection-popover/source-failure.png",
  );
}
async function sourceSuccess() {
  const previous = (await terminal(fixture.task.id)).lastAttempt.jobId;
  await send("PATCH_SCOPE");
  const page = await terminal(fixture.task.id, previous);
  assert.equal(page.lastAttempt.status, "SUCCEEDED");
  assert.equal(page.lastAttempt.request.kind, "selection");
  await $(".current-result-notice").waitForDisplayed();
  await browser.saveScreenshot(
    ".artifacts/selection-popover/source-success.png",
  );
  await assertActiveBatches(2);
  assert.equal(
    (await editor({ kind: "read", documentId: fixture.document.id })).document
      .content,
    fixture.base,
  );
  await stageRestartDraft();
}
async function assertActiveBatches(count) {
  const review = (
    await invoke("review_command", {
      request: {
        schemaVersion: 1,
        action: { kind: "state", taskId: fixture.task.id },
      },
    })
  ).value;
  assert.equal(
    review.batches.filter((value) => value.status === "ACTIVE").length,
    count,
  );
}
async function stageRestartDraft() {
  await $("button=원문").click();
  await selectSource("출발 시간과 이동 경로를 함께 기록합니다.");
  await $(".selection-context").$("button=이 부분 수정").waitForEnabled();
  await $(".selection-context").$("button=이 부분 수정").click();
  await $(".source-overlap").waitForDisplayed();
  assert.equal(
    await $(".source-selection-panel button[type=submit]").isEnabled(),
    false,
  );
  await $(".source-selection-panel textarea").setValue(
    "재실행 뒤 이어 쓸 지시",
  );
  await $(".source-selection-panel").$("button=원문으로 돌아가기").click();
  await browser.waitUntil(async () =>
    (await $("footer .draft-status").getText()).includes("저장됨"),
  );
  await writeFile(
    join(root, "popover-expected.json"),
    JSON.stringify({ fixture }),
  );
}
async function sourceOverlap() {
  const other = await createTask("다른 작업에서 겹침 검토");
  await selectSource("출발 시간과 이동 경로를 함께 기록합니다.");
  await $(".selection-context").$("button=이 부분 수정").click();
  await $(".source-overlap").waitForDisplayed();
  await $(".source-selection-panel textarea").setValue("다른 작업의 지시 보존");
  assert.equal(
    await $(".source-selection-panel button[type=submit]").isEnabled(),
    false,
  );
  await browser.saveScreenshot(
    ".artifacts/selection-popover/source-overlap.png",
  );
  await $(".source-overlap button").click();
  await $(".proposal-details .quote-text").waitForDisplayed();
  assert.equal(await $(".task-picker select").getValue(), fixture.task.id);
  assert.equal(await $(".historical-diff .diff-pane").isDisplayed(), false);
  assert.equal(await $("button=선택한 변경 승인").isEnabled(), true);
  const records = await editor({ kind: "read_drafts" });
  assert.ok(
    records.some(
      (record) =>
        record.key.includes(other) &&
        JSON.parse(record.valueJson || "null")?.instruction ===
          "다른 작업의 지시 보존",
    ),
  );
  await browser.saveScreenshot(
    ".artifacts/selection-popover/overlap-review.png",
  );
  await $("button=원문").click();
}
describe("선택 위치의 팝오버와 원문 부분 요청", () => {
  beforeEach(async () => {
    await foregroundUnitDisplay(1);
  });
  afterEach(async function () {
    if (this.currentTest.state === "failed") {
      await browser.saveScreenshot(".artifacts/selection-popover/failure.png");
      await writeFile(
        ".artifacts/selection-popover/failure-display.json",
        JSON.stringify(await readUnitDisplayState()),
      );
    }
  });
  it(
    "diff 팝오버의 수정·코멘트와 인용을 연결하고 상단 중복을 제거한다",
    diffActions,
  );
  it(
    "원문 선택은 일반 범위를 바꾸지 않고 실패 시 지시와 기존 제안을 보존한다",
    sourceFailure,
  );
  it(
    "선택한 원문에 새 부분 제안을 만들고 기존 묶음·확정본을 보존한다",
    sourceSuccess,
  );
  it(
    "다른 작업의 겹치는 제안으로 명시 이동하고 현재 검토와 지시를 보존한다",
    sourceOverlap,
  );
});
