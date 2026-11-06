import assert from "node:assert/strict";
import { mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { Key } from "webdriverio";
import { editor, invoke, prepare, root } from "./support/review-fixture.mjs";
import {
  chooseGroup,
  openCandidate,
  showSummary,
} from "./support/review-ui.mjs";
import { checkSelectedLayouts } from "./support/ux-layout.mjs";
import {
  prepareUxLocalDisplay,
  recordUxLocalFailure,
} from "./support/ux-local-display.mjs";
import { assertScrollClosesSelection } from "./support/ux-selection-scroll.mjs";
import {
  aiPreference,
  currentBatch,
  focusMatches,
  selectDiffText,
  storedSelection,
} from "./support/ux-ui.mjs";

let fixture, target, longCandidate;
const instruction =
  "의미와 수치를 유지하고 독자가 이해하기 쉬운 표현으로 다듬어 주세요. ".repeat(
    10,
  );
describe("선택 수정의 키보드·직접 수정·화면 상태", () => {
  beforeEach(prepareUxLocalDisplay);
  afterEach(function () {
    return recordUxLocalFailure(this.currentTest);
  });
  it(
    "긴 후보에서 키보드 선택 행동과 Esc 복귀를 제공한다",
    verifyCandidateKeyboard,
  );
  it(
    "문단 범위를 먼저 선택하고 긴 인용·지시·모델명을 9개 환경에서 유지한다",
    verifyParagraphLayouts,
  );
  it(
    "새 선택의 직접 수정은 AI 없이 선택 밖 문구와 확정본을 보존한다",
    verifyLocalCandidateEdit,
  );
  it(
    "변경 전 인용은 수정 대상으로 자동 대응하지 않는다",
    verifyBeforeQuoteIsReference,
  );
  it(
    "원문 편집 영향을 안내하고 명시적 선택 후에만 요청 범위를 바꾼다",
    verifyExplicitSourceScope,
  );
  it(
    "검토 완료는 실제 결정 수를 보여주고 확정본을 유지한다",
    verifyReviewCompletion,
  );
  it(
    "첫 작업과 지시를 함께 저장하되 확인 취소 후 자동 실행·중복 생성하지 않는다",
    verifyFirstTaskConfirmation,
  );
});
async function verifyCandidateKeyboard() {
  await mkdir(".artifacts/ux", { recursive: true });
  fixture = await prepare("bulk-review");
  target = fixture.batch.proposals.find((p) =>
    p.operation.headingPath.at(-1).startsWith("1."),
  );
  longCandidate =
    target.operation.after +
    " 의미와 수치를 유지하며 필요한 조건을 독자에게 명확하게 안내합니다.".repeat(
      20,
    );
  await chooseGroup(1);
  await openCandidate();
  await $(".candidate-form textarea").setValue(longCandidate);
  await $("button=후보 저장").click();
  await browser.waitUntil(
    async () =>
      (await currentBatch(fixture)).proposals.find((p) => p.id === target.id)
        .revision === 2,
  );
  await showSummary();
  await chooseGroup(1);
  await selectDiffText(target.operation.after);
  assert.equal(await focusMatches('[data-testid="diff-after"]'), true);
  await browser.keys([Key.Shift, Key.F10]);
  await browser.waitUntil(() => focusMatches(".selection-context button"));
  await assertScrollClosesSelection('[data-testid="diff-after"]');
  await browser.keys([Key.Shift, Key.F10]);
  await browser.waitUntil(() => focusMatches(".selection-context button"));
  await browser.saveScreenshot(".artifacts/ux/keyboard-selection.png");
  await browser.keys(Key.Escape);
  await browser.waitUntil(() => focusMatches('[data-testid="diff-after"]'));
}

async function verifyParagraphLayouts() {
  await browser.keys([Key.Shift, Key.F10]);
  await $(".selection-more summary").click();
  await $(".selection-context").$("button=이 문단 선택").click();
  await aiPreference({
    kind: "model",
    model: {
      provider: "codex",
      model: `fixture-long-model-${"reading-context-".repeat(5)}`,
      effort: "low",
    },
  });
  await aiPreference({ kind: "provider", provider: "codex" });
  try {
    await browser.keys([Key.Command, Key.Shift, Key.Enter]);
    await $(".selected-request-form textarea").waitForDisplayed();
    await $(".selected-request-form textarea").setValue(instruction);
    const selected = await storedSelection(fixture);
    assert.equal(selected.selection.quote, longCandidate);
    await checkSelectedLayouts(instruction);
    await $(".selected-request-form").$("button=변경 상세로 돌아가기").click();
    await browser.waitUntil(() => focusMatches('[data-testid="diff-after"]'));
  } finally {
    await aiPreference({ kind: "provider", provider: "claude" });
  }
}

async function verifyLocalCandidateEdit() {
  await selectDiffText(target.operation.after);
  await $(".selection-context").$("button=이 부분 수정").click();
  const replace = $("button=기존 초안 보관하고 새 대상 작성");
  if (await replace.isExisting()) await replace.click();
  await $("button=이 부분 직접 고치기").click();
  const selected = await storedSelection(fixture),
    selection = selected.selection;
  assert.equal(selection.toUtf16 - selection.fromUtf16, 3);
  await $(".selected-request-form textarea").setValue("직접 다듬은 표현");
  await $("button=선택 부분 후보 저장").click();
  await browser.waitUntil(
    async () =>
      (await currentBatch(fixture)).proposals.find((p) => p.id === target.id)
        .revision === 3,
  );
  const batch = await currentBatch(fixture);
  assert.equal(
    batch.proposals.find((p) => p.id === target.id).operation.after,
    longCandidate.slice(0, selection.fromUtf16) +
      "직접 다듬은 표현" +
      longCandidate.slice(selection.toUtf16),
  );
  assert.deepEqual(
    batch.proposals.filter((p) => p.id !== target.id),
    fixture.batch.proposals.filter((p) => p.id !== target.id),
  );
  assert.equal(
    await readFile(join(root, "bulk-review.md"), "utf8"),
    fixture.base,
  );
  await browser.waitUntil(async () =>
    (await $(".proposal-details").getText()).includes("수정안 3 · 미승인"),
  );
  await $("button=선택한 변경 승인").waitForEnabled();
  await $("button=이전 수정안과 비교").click();
  await $(".historical-diff .diff-pane").waitForDisplayed();
  assert.equal(await $("button=선택한 변경 승인").isDisplayed(), false);
  await browser.saveScreenshot(".artifacts/ux/proposal-history.png");
  await $("button=검토로 돌아가기").click();
}

async function verifyBeforeQuoteIsReference() {
  await selectDiffText(target.operation.before, "before");
  await $(".selection-context").$("button=이 부분 수정").click();
  assert.match(await $(".review-tools").getText(), /참고 인용/);
  assert.equal(await $(".selected-request-form textarea").isExisting(), false);
  await browser.saveScreenshot(".artifacts/ux/invalid-selection.png");
}

async function verifyExplicitSourceScope() {
  await $("button=원문").click();
  await $(".source-impact").waitForDisplayed();
  await browser.saveScreenshot(".artifacts/ux/source-impact.png");
  const source = $('[data-testid="source-editor"]');
  await source.click();
  await browser.keys([Key.Command, Key.Home]);
  await browser.keys([
    Key.Shift,
    Key.ArrowRight,
    Key.ArrowRight,
    Key.ArrowRight,
  ]);
  assert.equal(await $(".scope-bar select").getValue(), "whole");
  await $(".scope-bar").$("button=변경").click();
  await browser.execute(() => {
    const select = document.querySelector(".scope-bar select");
    select.value = "selection";
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
  assert.equal(await $(".scope-bar select").getValue(), "selection");
  await $(".request-form textarea").setValue("선택한 원문만 다듬어 주세요");
  await browser.saveScreenshot(".artifacts/ux/source-scope.png");
  await $(".request-form").$("button=요청 내용 확인").click();
  await $(".generation-dialog").waitForDisplayed();
  await $("button=요청 취소").click();
}

async function verifyReviewCompletion() {
  await $("button=변경 검토").click();
  await showSummary();
  for (let index = 0; index < 3; index++) {
    await $("button=선택한 변경 거절").waitForEnabled();
    await $("button=선택한 변경 거절").click();
  }
  await browser.waitUntil(async () =>
    (await $(".review-panel").getText()).includes("검토 완료"),
  );
  assert.match(await $(".review-panel").getText(), /거절 3개/);
  assert.equal(await $(".selection-notice").isExisting(), false);
  assert.equal(
    await readFile(join(root, "bulk-review.md"), "utf8"),
    fixture.base,
  );
  await browser.saveScreenshot(".artifacts/ux/completed-review.png");
}

async function verifyFirstTaskConfirmation() {
  await $(".document-actions").$("button=새 문서").click();
  await browser.waitUntil(
    async () => (await $(".document-toolbar h1").getText()) === "새 문서",
  );
  await $(".first-request .request-form textarea").waitForDisplayed();
  await $(".first-request .request-form textarea").setValue(
    "사실을 유지하고 간결하게 안내",
  );
  await $(".first-request").$("button=요청 내용 확인").click();
  await $(".generation-dialog").waitForDisplayed();
  await browser.saveScreenshot(".artifacts/ux/first-request-confirm.png");
  await $("button=요청 취소").click();
  await browser.saveScreenshot(".artifacts/ux/request-types.png");
  assert.equal(
    await $(".request-form textarea").getValue(),
    "사실을 유지하고 간결하게 안내",
  );
  const taskId = await $(".task-picker select").getValue();
  const state = await editor({
    kind: "read",
    documentId: (await storedCurrentDocument()).id,
  });
  assert.equal(state.tasks.length, 1);
  assert.ok(taskId);
  assert.equal(await $(".generation-dialog").isExisting(), false);
}

async function storedCurrentDocument() {
  const state = await invoke("get_workspace_snapshot", {
    request: { schemaVersion: 1 },
  });
  return (await editor({ kind: "read", documentId: state.selectedDocumentId }))
    .document;
}
