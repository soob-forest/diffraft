import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Key } from "webdriverio";
import { editor, prepare, root } from "./support/review-fixture.mjs";
import { chooseGroup } from "./support/review-ui.mjs";
import { selectSource } from "./support/source-ui.mjs";
import {
  currentBatch,
  focusMatches,
  selectDiffText,
  storedSelection,
} from "./support/ux-ui.mjs";

const sourceInstruction = "원문 선택의 지시를 보존합니다";
const reviewInstruction = "후보 선택의 지시를 보존합니다";
const sourceLine = "출발 시간과 이동 경로를 함께 기록합니다.";
const sourceForm = ".source-selection-panel";
const reviewForm = ".review-detail .selected-request-form";
let fixture, first;

describe("선택 수정의 화면·결과 전환", () => {
  before(async () => {
    await mkdir(".artifacts/selection-transitions", { recursive: true });
    fixture = await prepare("bulk-review");
    first = fixture.batch.proposals.find((proposal) =>
      proposal.operation.headingPath.at(-1).startsWith("1."),
    );
  });
  afterEach(async function () {
    if (this.currentTest.state === "failed")
      await browser.saveScreenshot(
        `.artifacts/selection-transitions/failure-${this.currentTest.title.length}.png`,
      );
    await closeComposers();
  });
  it("원문과 후보를 왕복해도 각 화면의 대상·지시와 요청 가능 상태를 유지한다", async () => {
    await openSource();
    await $(`${sourceForm} textarea`).setValue(sourceInstruction);
    await $("button=변경 검토").click();
    await chooseGroup(1);
    await openReview(first.operation.after);
    await $(`${reviewForm} textarea`).setValue(reviewInstruction);
    await $("button=원문").click();
    assert.equal(
      await $(`${sourceForm} textarea`).getValue(),
      sourceInstruction,
    );
    assert.match(await $(sourceForm).getText(), /원문 · v12/);
    await $(`${sourceForm} button[type=submit]`).waitForEnabled();
    assert.equal((await $(sourceForm).getText()).includes("확인 중…"), false);
    await browser.saveScreenshot(
      ".artifacts/selection-transitions/source-return.png",
    );
    await $("button=변경 검토").click();
    assert.equal(
      await $(`${reviewForm} textarea`).getValue(),
      reviewInstruction,
    );
  });
  it("미리보기와 변경 검토를 왕복하면 이전 팝오버를 재표시하지 않는다", async () => {
    await $("button=원문").click();
    for (const mode of ["미리보기", "변경 검토"]) {
      await selectSource(sourceLine, true);
      await $(".document-main > .selection-context").waitForDisplayed();
      await $(`button=${mode}`).click();
      await $("button=원문").click();
      await settleFrames();
      assert.equal(
        await $(".document-main > .selection-context").isExisting(),
        false,
      );
    }
    await $("button=변경 검토").click();
    await chooseGroup(1);
    await selectExactReviewLine(first.operation.after);
    await browser.keys([Key.Shift, Key.F10]);
    await $(".diff-viewer .selection-context").waitForDisplayed();
    await $("button=원문").click();
    await $("button=변경 검토").click();
    await settleFrames();
    assert.equal(
      await $(".diff-viewer .selection-context").isExisting(),
      false,
    );
  });
  it("유효 선택 우클릭은 기본 메뉴를 막고 빈 선택은 기본 메뉴를 보존한다", async () => {
    await $("button=원문").click();
    await selectSource(sourceLine, true);
    assert.equal(await contextPrevented(), true);
    await $(".document-main > .selection-context").waitForDisplayed();
    await browser.keys(Key.Escape);
    await browser.waitUntil(() =>
      focusMatches('[data-testid="source-editor"]'),
    );
    await browser.keys(Key.ArrowRight);
    await settleFrames();
    assert.equal(await contextPrevented(), false);
    assert.equal(
      await $(".document-main > .selection-context").isExisting(),
      false,
    );
  });
  it("A를 부분 수정하는 동안 B를 읽어도 저장 뒤 A의 새 후보와 승인 대상으로 복귀한다", async () => {
    await $("button=변경 검토").click();
    await chooseGroup(1);
    await openReview(first.operation.after);
    await $("button=이 부분 직접 고치기").click();
    await $(`${reviewForm} textarea`).setValue("검토된 표현");
    await chooseGroup(2);
    await $("button=선택 부분 후보 저장").click();
    await browser.waitUntil(async () =>
      (await currentBatch(fixture)).proposals.some(
        (proposal) => proposal.id === first.id && proposal.revision === 2,
      ),
    );
    await $(
      `.proposal-card[data-proposal-id="${first.id}"]`,
    ).waitForDisplayed();
    assert.equal(
      await $(`.proposal-card[data-proposal-id="${first.id}"]`).isDisplayed(),
      true,
    );
    assert.match(await $(".proposal-details").getText(), /수정안 2 · 미승인/);
    assert.match(await $(".selected-group").getText(), /1\. 출발 준비/);
    await browser.saveScreenshot(
      ".artifacts/selection-transitions/exact-result.png",
    );
    const state = await editor({
      kind: "read",
      documentId: fixture.document.id,
    });
    assert.equal(state.document.content, fixture.base);
  });
  it("재실행용 원문·후보 초안을 각각 보관하고 AI를 자동 실행하지 않는다", async () => {
    await openSource();
    await $(`${sourceForm} textarea`).setValue(sourceInstruction);
    await $(sourceForm).$("button=원문으로 돌아가기").click();
    await $("button=변경 검토").click();
    await chooseGroup(2);
    const second = fixture.batch.proposals.find((proposal) =>
      proposal.operation.headingPath.at(-1).startsWith("2."),
    );
    await selectExactReviewLine(second.operation.after);
    await beginReviewSelection();
    const reviewTarget = await storedSelection(fixture);
    assert.equal(reviewTarget.proposalId, second.id);
    await $(`${reviewForm} textarea`).setValue(reviewInstruction);
    await $(reviewForm).$("button=변경 상세로 돌아가기").click();
    await $("button=원문").click();
    await browser.waitUntil(async () =>
      (await $("footer .draft-status").getText()).includes("저장됨"),
    );
    await writeFile(
      join(root, "transition-expected.json"),
      JSON.stringify({
        fixture,
        reviewTarget,
        sourceInstruction,
        reviewInstruction,
      }),
    );
  });
});

async function openSource() {
  await $("button=원문").click();
  const resume = $(".source-draft-resume");
  if (await resume.isDisplayed()) await resume.click();
  else {
    await selectSource(sourceLine, true);
    await $(".document-main > .selection-context")
      .$("button=이 부분 수정")
      .click();
    await adoptReplacement(sourceForm);
  }
  await $(`${sourceForm} textarea`).waitForDisplayed();
}
async function openReview(text) {
  await selectDiffText(text);
  await beginReviewSelection();
}
async function beginReviewSelection() {
  await browser.execute(() =>
    document.querySelector('[data-testid="diff-after"]').focus(),
  );
  await settleFrames();
  await browser.keys([Key.Command, Key.Shift, Key.Enter]);
  await $(reviewForm).waitForDisplayed();
  await adoptReplacement(reviewForm);
  await $(`${reviewForm} textarea`).waitForDisplayed();
}
async function selectExactReviewLine(text) {
  await browser.execute((text) => {
    const editor = document.querySelector('[data-testid="diff-after"]');
    const line = [...editor.querySelectorAll(".cm-line")].find((node) =>
      node.textContent.includes(text),
    );
    if (!line) throw new Error("후보 행을 찾을 수 없습니다.");
    editor.focus();
    const range = document.createRange();
    range.selectNodeContents(line);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    document.dispatchEvent(new Event("selectionchange"));
  }, text);
  await settleFrames();
}
async function adoptReplacement(form) {
  const button = $(form).$("button=기존 초안 보관하고 새 대상 작성");
  if (await button.isExisting()) await button.click();
}
async function closeComposers() {
  for (const [form, label] of [
    [sourceForm, "원문으로 돌아가기"],
    [reviewForm, "변경 상세로 돌아가기"],
  ]) {
    const parent = $(form);
    if (!(await parent.isExisting()) || !(await parent.isDisplayed())) continue;
    const button = parent.$(`button=${label}`);
    if (await button.isDisplayed()) await button.click();
  }
}
async function contextPrevented() {
  return browser.execute(() => {
    const editor = document.querySelector('[data-testid="source-editor"]');
    const event = new MouseEvent("contextmenu", {
      bubbles: true,
      cancelable: true,
    });
    editor.dispatchEvent(event);
    return event.defaultPrevented;
  });
}
async function settleFrames() {
  await browser.execute(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  );
}
