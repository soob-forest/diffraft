import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  chooseRequestMode,
  conversation,
  showTaskPanel,
  terminal,
} from "./support/generation-fixture.mjs";
import { verifyRequestEntryFocus } from "./support/request-followup-focus.mjs";
import { cancelQuestion } from "./support/request-workflow-cancel.mjs";
import { inspectRequestLayouts } from "./support/request-workflow-layout.mjs";
import { editor, invoke, prepare, root } from "./support/review-fixture.mjs";
import { chooseGroup, showSummary } from "./support/review-ui.mjs";
import { selectSource } from "./support/source-ui.mjs";

let fixture;
describe("재시작·검토 변경 질문", () => {
  afterEach(async function () {
    if (this.currentTest.state === "failed")
      await browser.saveScreenshot(
        ".artifacts/request-workflow/failed-restart.png",
      );
  });
  it(
    "작업 생성 전 전체 초안을 목적·대상과 함께 복원하고 자동 전송하지 않는다",
    verifyPreTaskRestart,
  );
  it(
    "이유 묻기는 선택한 후보를 고정해 전달하고 성공·실패 뒤 원문과 결정을 유지한다",
    verifyProposalQuestion,
  );
});

async function createWholeReview() {
  const { prepareRewrite, requestRewrite, start, waitCandidate } = await import(
    "./support/rewrite-fixture.mjs"
  );
  const whole = await prepareRewrite();
  await requestRewrite();
  await start("REWRITE_UNITS");
  whole.batch = await waitCandidate(whole.task.id, 1);
  return whole;
}
async function inspectWholeFollowup() {
  await showSummary();
  await $(".whole-followup").$("button=더 고치기").click();
  await $(".selected-request-form textarea").waitForDisplayed();
  assert.match(await $(".selected-request-form").getText(), /전체 재작성 후보/);
  await $(".selected-request-form").$("button=변경 상세로 돌아가기").click();
  await $(".whole-followup").$("button=이유 묻기").click();
  await $(".request-form .question-target").waitForDisplayed();
  await $(".request-form textarea").setValue("전체 수정안의 이유는?");
  await $(".request-form button[type=submit]").click();
  await $(".generation-dialog").waitForDisplayed();
  await $("button=요청 취소").click();
}
describe("전체 후보와 변경 단위의 후속 행동", () => {
  afterEach(async function () {
    if (this.currentTest.state === "failed") {
      await browser.saveScreenshot(
        ".artifacts/request-workflow/failed-whole.png",
      );
      await writeFile(
        ".artifacts/request-workflow/failed-whole.json",
        JSON.stringify(
          await browser.execute(() => ({
            texts: [
              ...document.querySelectorAll(
                "[role=alert],.generation-panel>[role=status]",
              ),
            ].map((n) => n.textContent),
          })),
        ),
      );
    }
  });
  it(
    "WHOLE 후보 수정과 질문을 직접 열고 CHANGES에서는 원문을 다시 선택하게 한다",
    verifyWholeAndUnitFollowup,
  );
});

describe("섹션 요청 대상 고정", () => {
  it(
    "다른 섹션을 읽어도 고정하고 명시적 범위 확인으로만 바꾼다",
    verifySectionPin,
  );
});
describe("요청 진입 포커스", () => {
  it("접힌 조건과 열린 조건보다 이번 요청에 입력한다", verifyRequestEntryFocus);
});

async function verifyPreTaskRestart() {
  const previous = JSON.parse(
    await readFile(join(root, "workflow-restart.json"), "utf8"),
  );
  assert.notEqual(await invoke("e2e_process_id", {}), previous.pid);
  await showTaskPanel();
  await $(".first-request .request-form textarea").waitForDisplayed();
  assert.equal(
    await $(".request-form textarea").getValue(),
    "재시작할 전체 초안",
  );
  assert.equal(await $('select[aria-label="수정 방식"]').getValue(), "REWRITE");
  assert.equal(
    (await editor({ kind: "read", documentId: previous.documentId })).tasks
      .length,
    0,
  );
  assert.equal(await $(".generation-dialog").isExisting(), false);
  await $(".request-form button[type=submit]").click();
  await $(".generation-dialog").waitForDisplayed();
  await $("button=요청 취소").click();
  assert.equal(
    (await editor({ kind: "read", documentId: previous.documentId })).tasks
      .length,
    1,
  );
}

async function verifyProposalQuestion() {
  const label = await prepareProposalQuestion();
  await verifyProposalAnswer(label);
}
async function prepareProposalQuestion() {
  fixture = await prepare("review");
  await chooseGroup(1);
  await $("button=이유 묻기").click();
  await $(".question-target").waitForDisplayed();
  await $(".request-form textarea").setValue("이 변경의 이유를 알려 주세요.");
  await inspectRequestLayouts("proposal-question");
  const label = await $(".request-form .question-target strong").getText();
  await showSummary();
  await chooseGroup(2);
  await showTaskPanel();
  assert.equal(
    await $(".request-form .question-target strong").getText(),
    label,
  );
  await $(".request-form button[type=submit]").click();
  await $(".generation-dialog").waitForDisplayed();
  return label;
}
async function verifyProposalAnswer(label) {
  const before = await editor({
    kind: "read",
    documentId: fixture.document.id,
  });
  const cancelled = await cancelQuestion(fixture.task.id);
  await $(".request-form button[type=submit]").click();
  await $(".generation-dialog").waitForDisplayed();
  await writeFile(join(root, "next-generation"), "malformed");
  await $("button=확인 후 요청").click();
  assert.equal(
    (await terminal(fixture.task.id, cancelled)).lastAttempt.status,
    "FAILED",
  );
  assert.equal(
    await $(".request-form textarea").getValue(),
    "이 변경의 이유를 알려 주세요.",
  );
  const failed = (await conversation(fixture.task.id)).lastAttempt;
  await $(".request-form button[type=submit]").waitForEnabled();
  await $(".request-form button[type=submit]").click();
  await $(".generation-dialog").waitForDisplayed();
  await writeFile(join(root, "next-generation"), "EXPLAIN");
  await $("button=확인 후 요청").click();
  const page = await terminal(fixture.task.id, failed.jobId);
  assert.equal(page.lastAttempt.status, "SUCCEEDED");
  assert.equal(
    page.lastAttempt.request.value.question.label,
    label.replace(/^질문 대상 · /, "").replace(/의 수정안$/, ""),
  );
  assert.equal(page.messages.at(-1).question.subject.kind, "proposal");
  const after = await editor({
    kind: "read",
    documentId: fixture.document.id,
  });
  assert.deepEqual(after.document, before.document);
  assert.equal(await readFile(join(root, "review.md"), "utf8"), fixture.base);
  await browser.waitUntil(async () =>
    (await $(".conversation").getText()).includes("질문한 제안 보기"),
  );
  await browser.saveScreenshot(
    ".artifacts/request-workflow/change-question-answer.png",
  );
}

async function verifyWholeAndUnitFollowup() {
  const whole = await createWholeReview();
  await inspectWholeFollowup();
  await $("button=변경별 검토 시작").click();
  await $(".unit-review").waitForDisplayed();
  await askUnitQuestion(whole);
  await requestConfirmedSource();
}
async function askUnitQuestion(whole) {
  await $("button=코멘트").click();
  await $(".review-detail").$("button=이유 묻기").click();
  await $(".request-form .question-target").waitForDisplayed();
  assert.match(
    await $(".request-form .question-target strong").getText(),
    /변경 1/,
  );
  await $(".request-form textarea").setValue(
    "이 단위 전체의 이유를 알려 주세요.",
  );
  await inspectRequestLayouts("unit-question");
  await $(".request-form button[type=submit]").click();
  await $(".generation-dialog").waitForDisplayed();
  await writeFile(join(root, "next-generation"), "EXPLAIN");
  await $("button=확인 후 요청").click();
  const page = await terminal(whole.task.id);
  assert.equal(page.lastAttempt.request.value.question.subject.kind, "unit");
  const state = await editor({ kind: "read", documentId: whole.document.id });
  assert.equal(state.document.version, 14);
  await inspectQuestionResult(page.lastAttempt.request.value.question);
}
async function inspectQuestionResult(question) {
  await browser.waitUntil(async () =>
    (await $(".conversation").getText()).includes("질문한 제안 보기"),
  );
  await $(".conversation").$("button=질문한 제안 보기").click();
  await $(".review-detail > .question-target").waitForDisplayed();
  assert.equal(await $(".unit-picker select").getValue(), question.subject.id);
  assert.match(
    await $(".review-detail > .question-target").getText(),
    /변경 1/,
  );
}
async function requestConfirmedSource() {
  await $("button=코멘트").click();
  await $(".review-detail").$("button=확정본에서 새 요청").click();
  await $('[data-testid="source-editor"]').waitForDisplayed();
  await showTaskPanel();
  assert.equal(await $(".request-form .question-target").isExisting(), false);
  assert.equal(await $(".scope-bar select").getValue(), "selection");
  await $(".request-form textarea").setValue("범위를 다시 선택할 새 요청");
  await $(".request-form button[type=submit]").click();
  await browser.waitUntil(async () =>
    (await $(".generation-panel > [role=status]").getText()).includes(
      "선택 영역이 없습니다",
    ),
  );
  assert.equal(await $(".generation-dialog").isExisting(), false);
  await browser.saveScreenshot(
    ".artifacts/request-workflow/changes-new-source-request.png",
  );
}

async function verifySectionPin() {
  await prepare("conflict-review");
  await $("button=원문").click();
  await showTaskPanel();
  await selectSource("출발 전 10분");
  await $(".scope-bar").$("button=변경").click();
  await browser.execute(() => {
    const select = document.querySelector(".scope-bar select");
    select.value = "section";
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await selectSource("필요하면 다음");
  assert.match(await $(".scope-summary").getText(), /2. 확인 시간/);
  await chooseRequestMode("EXPLAIN");
  await $(".request-form textarea").setValue("고정한 섹션을 설명해 주세요");
  await $(".request-form button[type=submit]").click();
  await $(".generation-dialog").waitForDisplayed();
  assert.match(
    await browser.execute(
      () => document.querySelector(".generation-dialog pre").textContent,
    ),
    /출발 전 10분/,
  );
  await $("button=요청 취소").click();
  await $("button=범위 확인").click();
  await browser.waitUntil(async () =>
    (await $(".scope-summary").getText()).includes("3. 여행 기록"),
  );
  await $(".request-form button[type=submit]").click();
  await $(".generation-dialog").waitForDisplayed();
  assert.match(
    await browser.execute(
      () => document.querySelector(".generation-dialog pre").textContent,
    ),
    /필요하면 다음/,
  );
  await $("button=요청 취소").click();
}
