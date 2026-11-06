import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  chooseRequestMode,
  conversation,
  showTaskPanel,
  terminal,
} from "./support/generation-fixture.mjs";
import {
  verifyGeneralPreparationRace,
  verifySelectedPreparationRace,
} from "./support/request-preparation-boundaries.mjs";
import { editor, prepare, root } from "./support/review-fixture.mjs";
import {
  chooseGroup,
  openRegenerate,
  openReviewOptions,
  showSummary,
} from "./support/review-ui.mjs";
import { selectSource } from "./support/source-ui.mjs";
import { foregroundUnitDisplay } from "./support/unit-review-display.mjs";
import { selectDiffText } from "./support/ux-ui.mjs";

let fixture;
const sourceForm = ".source-selection-panel";
const selectedForm = ".selected-request-form";
const instruction = "클릭 취소 뒤에도 정확한 대상과 지시를 보존";
describe("요청 흐름 보완", () => {
  before(async () => {
    await mkdir(".artifacts/request-followup", { recursive: true });
    fixture = await prepare("review");
    await chooseGroup(1);
  });
  beforeEach(async () => {
    await foregroundUnitDisplay(1);
  });
  afterEach(async function () {
    if (this.currentTest.state === "failed")
      await browser.saveScreenshot(".artifacts/request-followup/failure.png");
  });
  it(
    "검토의 새 전체 초안 진입에서도 종류별 지시를 섞지 않는다",
    verifyModeEntry,
  );
  it(
    "모델 변경은 확인을 해제하고 설정 조회만으로는 확인을 해제하지 않는다",
    verifyModelInvalidation,
  );
  it(
    "원문 클릭으로 수정창과 고정을 해제하고 같은 초안을 이어 쓴다",
    verifySourceDismiss,
  );
  it(
    "후보 본문 클릭도 미전송 확인을 해제하고 초안의 대상을 보존한다",
    verifyCandidateDismiss,
  );
  it(
    "초안 저장 실패면 클릭으로 닫지 않고 입력을 남겨 재시도한다",
    verifyDismissFailure,
  );
  it("일반 요청 준비 중 모델 변경은 늦은 확인을 폐기한다", () =>
    verifyGeneralPreparationRace(modelSettings));
  it("선택 요청 준비 중 모델 변경은 지시·대상을 보존하고 재확인한다", () =>
    verifySelectedPreparationRace(modelSettings));
});
async function modelSettings(value) {
  await $("button=AI 연결 설정").click();
  await $("#default-model").waitForEnabled();
  if (value) {
    await browser.execute((value) => {
      const select = document.querySelector("#default-model");
      select.value = value;
      select.dispatchEvent(new Event("change", { bubbles: true }));
    }, value);
    await $("button=모델 설정 저장").click();
    await browser.waitUntil(async () =>
      (await $(".model-settings [role=status]").getText()).includes(
        "저장했습니다",
      ),
    );
  }
  await $("button=설정 닫기").click();
}
async function clickBody(selector) {
  const lines = await $$(selector);
  await lines.at(-1).scrollIntoView();
  await browser
    .action("pointer")
    .move({ origin: lines.at(-1) })
    .down({ button: 0 })
    .up({ button: 0 })
    .perform();
}
async function activeDraft() {
  await browser.waitUntil(async () =>
    (await $("footer .draft-status").getText()).includes("저장됨"),
  );
  const records = await editor({ kind: "read_drafts" });
  const index = records.find(
    (record) =>
      record.key ===
      JSON.stringify([
        "selected-request",
        fixture.document.id,
        fixture.task.id,
        "active",
      ]),
  );
  const key = JSON.parse(index.valueJson).key;
  return JSON.parse(records.find((record) => record.key === key).valueJson);
}

async function verifyModeEntry() {
  await showTaskPanel();
  for (const mode of ["PATCH", "EXPLAIN", "REWRITE"]) {
    await chooseRequestMode(mode);
    await $(".request-form textarea").setValue(`${mode} 전용 지시`);
  }
  await chooseRequestMode("PATCH");
  await openReviewOptions();
  await $("button=확정본 전체에서 새 초안 요청").click();
  await $(".request-form textarea").waitForDisplayed();
  assert.equal(
    await $(".request-form textarea").getValue(),
    "REWRITE 전용 지시",
  );
  await chooseRequestMode("EXPLAIN");
  assert.equal(
    await $(".request-form textarea").getValue(),
    "EXPLAIN 전용 지시",
  );
  await chooseRequestMode("PATCH");
  assert.equal(await $(".request-form textarea").getValue(), "PATCH 전용 지시");
  await showSummary();
}
async function verifyModelInvalidation() {
  await modelSettings("sonnet");
  await openRegenerate();
  await $(".regenerate-form textarea").setValue(instruction);
  await $(".regenerate-form button[type=submit]").click();
  await $(".regenerate-form").$("button=확인 후 요청").waitForDisplayed();
  await modelSettings();
  assert.equal(
    await $(".regenerate-form").$("button=확인 후 요청").isDisplayed(),
    true,
  );
  await modelSettings("opus");
  await $(".regenerate-form").$("button=요청 내용 확인").waitForDisplayed();
  assert.equal(await $(".regenerate-form textarea").getValue(), instruction);
  await $(".regenerate-form button[type=submit]").click();
  await $(".regenerate-form").$("button=확인 후 요청").waitForDisplayed();
  await writeFile(join(root, "next-generation"), "REGENERATE");
  await $(".regenerate-form").$("button=확인 후 요청").click();
  const page = await terminal(fixture.task.id);
  assert.equal(page.lastAttempt.status, "SUCCEEDED");
  assert.equal(page.lastAttempt.request.value.model.model, "opus");
  await browser.saveScreenshot(".artifacts/request-followup/model-renewed.png");
}
async function verifySourceDismiss() {
  await $("button=원문").click();
  await selectSource("출발 시간과 이동 경로를 함께 기록합니다.", true);
  await $(".selection-context").$("button=이 부분 수정").click();
  await $(`${sourceForm} textarea`).setValue(instruction);
  const quote = await $(`${sourceForm} .quote-text`).getText();
  await $(`${sourceForm} textarea`).click();
  assert.equal(await $(sourceForm).isDisplayed(), true);
  await clickBody(".source-editor .cm-line");
  await browser.waitUntil(async () => !(await $(sourceForm).isExisting()));
  assert.equal(await $(".source-pinned-selection").isExisting(), false);
  assert.equal(await $(".selection-context").isExisting(), false);
  assert.equal(
    await browser.execute(() =>
      document.activeElement?.matches('[data-testid="source-editor"]'),
    ),
    true,
  );
  await $(".source-draft-resume").click();
  assert.equal(await $(`${sourceForm} textarea`).getValue(), instruction);
  assert.equal(await $(`${sourceForm} .quote-text`).getText(), quote);
  await browser.saveScreenshot(
    ".artifacts/request-followup/source-resumed.png",
  );
  await clickBody(".source-editor .cm-line");
  await browser.waitUntil(async () => !(await $(sourceForm).isExisting()));
}
async function verifyCandidateDismiss() {
  await $("button=변경 검토").click();
  await chooseGroup(2);
  const proposal = fixture.batch.proposals.find((value) =>
    value.operation.headingPath.at(-1).startsWith("2."),
  );
  await selectDiffText(proposal.operation.after);
  await $(".selection-context").$("button=이 부분 수정").click();
  await $(`${selectedForm} textarea`).waitForDisplayed();
  await $(`${selectedForm} textarea`).setValue(instruction);
  await $(`${selectedForm} button[type=submit]`).click();
  await $(`${selectedForm} .selection-confirmation`).waitForDisplayed();
  const before = await activeDraft();
  assert.ok(before.prepared);
  await clickBody('[data-testid="diff-after"] .cm-line');
  await browser.waitUntil(async () => !(await $(selectedForm).isExisting()));
  assert.equal(
    await browser.execute(() =>
      document.activeElement?.matches('[data-testid="diff-after"]'),
    ),
    true,
  );
  const after = await activeDraft();
  assert.deepEqual(after.target, before.target);
  assert.equal(after.instruction, instruction);
  assert.equal(after.prepared, null);
  await $("button=선택 수정 초안 이어쓰기").click();
  await $(`${selectedForm} textarea`).waitForDisplayed();
  assert.equal(await $(`${selectedForm} textarea`).getValue(), instruction);
  await browser.saveScreenshot(
    ".artifacts/request-followup/candidate-resumed.png",
  );
  assert.equal(
    (await conversation(fixture.task.id)).lastAttempt.status,
    "SUCCEEDED",
  );
  assert.equal(
    (await editor({ kind: "read", documentId: fixture.document.id })).document
      .content,
    fixture.base,
  );
}
async function verifyDismissFailure() {
  await $("button=원문").click();
  await $(".source-draft-resume").click();
  await $(`${sourceForm} textarea`).waitForDisplayed();
  await browser.waitUntil(async () =>
    (await $("footer .draft-status").getText()).includes("저장됨"),
  );
  const database = join(root, "data/workspace.sqlite3");
  execFileSync("/usr/bin/sqlite3", [
    database,
    "CREATE TRIGGER deny_click_draft BEFORE INSERT ON drafts BEGIN SELECT RAISE(ABORT,'fixture'); END;",
  ]);
  try {
    await $(`${sourceForm} textarea`).setValue(`${instruction} 실패 검사`);
    await clickBody(".source-editor .cm-line");
    await browser.waitUntil(async () =>
      (await $(sourceForm).getText()).includes("저장할 수 없습니다"),
    );
    assert.equal(await $(sourceForm).isDisplayed(), true);
    assert.equal(
      await $(`${sourceForm} textarea`).getValue(),
      `${instruction} 실패 검사`,
    );
    await browser.saveScreenshot(
      ".artifacts/request-followup/dismiss-save-failed.png",
    );
  } finally {
    execFileSync("/usr/bin/sqlite3", [
      database,
      "DROP TRIGGER deny_click_draft;",
    ]);
  }
  await clickBody(".source-editor .cm-line");
  await browser.waitUntil(async () => !(await $(sourceForm).isExisting()));
}
