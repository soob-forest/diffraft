import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { checkDraftRecoveryLayouts } from "./support/draft-recovery-layout.mjs";
import { conversation, showTaskPanel } from "./support/generation-fixture.mjs";
import { editor, root } from "./support/review-fixture.mjs";
import { chooseGroup, openCandidate } from "./support/review-ui.mjs";

let expected;
async function cancelledPreparationAfterRestart() {
  expected = JSON.parse(
    await readFile(join(root, "reliability-expected.json"), "utf8"),
  );
  await $(".request-form textarea").waitForDisplayed();
  assert.equal(
    await $(".request-form textarea").getValue(),
    "첫 확인 취소 지시",
  );
  assert.equal(await $(".generation-dialog").isExisting(), false);
  assert.equal(
    (await conversation(expected.firstTask.taskId)).lastAttempt,
    null,
  );
  assert.match(await $("footer .draft-status").getText(), /1건 복원 보류/);
  const raw = (await editor({ kind: "read_drafts" })).find(
    (record) => record.key === expected.badKey,
  );
  assert.equal(raw.valueJson, '{"after":null}');
  assert.equal(raw.revision, 1);
}

async function sourceScopeAfterRestart() {
  await $(".sidebar").$(`button=${expected.fixture.document.title}`).click();
  await browser.waitUntil(
    async () =>
      (await $(".document-toolbar h1").getText()) ===
      expected.fixture.document.title,
  );
  await $("button=원문").click();
  await showTaskPanel();
  await $(".request-form textarea").waitForEnabled();
  assert.equal(await $(".scope-bar select").getValue(), "selection");
  await $(".request-form").$("button=요청 내용 확인").click();
  await $(".generation-dialog").waitForDisplayed();
  await $(".generation-dialog").$("button=요청 취소").click();
  await $(".request-form textarea").setValue("정상 초안 저장 가능");
  await browser.waitUntil(async () =>
    (await $("footer .draft-status").getText()).includes("저장됨"),
  );
  const records = await editor({ kind: "read_drafts" });
  assert.equal(
    records.find((record) => record.key === expected.badKey).valueJson,
    '{"after":null}',
  );
  const normalKey = JSON.stringify([
    "request",
    expected.fixture.document.id,
    expected.fixture.task.id,
  ]);
  assert.equal(
    JSON.parse(records.find((record) => record.key === normalKey).valueJson)
      .instruction,
    "정상 초안 저장 가능",
  );
}

async function quarantinedDraftRecovery() {
  await chooseGroup(1);
  await openCandidate();
  await assertLockedCandidate();
  await $("footer .draft-quarantine summary").click();
  const raw = JSON.parse(
    await $('textarea[aria-label="복원 보류 초안 원본"]').getValue(),
  );
  assert.equal(raw.key, expected.badKey);
  assert.equal(raw.valueJson, '{"after":null}');
  await browser.saveScreenshot(".artifacts/draft-reliability/quarantined.png");
  await checkDraftRecoveryLayouts(".artifacts/draft-reliability");
  await $("footer").$("button=이 초안 원본 삭제·입력 잠금 해제").click();
  await browser.waitUntil(
    async () => !(await $("footer .draft-quarantine").isExisting()),
  );
  assert.equal(
    await browser.execute(
      () => document.querySelector(".candidate-form form").inert,
    ),
    false,
  );
  assert.equal(
    (await editor({ kind: "read_drafts" })).find(
      (record) => record.key === expected.badKey,
    ).valueJson,
    null,
  );
  await $(".candidate-form textarea").setValue("복구 후 수정 가능한 후보");
  await browser.waitUntil(async () =>
    (await $("footer .draft-status").getText()).includes("저장됨"),
  );
  assert.equal(
    JSON.parse(
      (await editor({ kind: "read_drafts" })).find(
        (record) => record.key === expected.badKey,
      ).valueJson,
    ).after,
    "복구 후 수정 가능한 후보",
  );
  await browser.saveScreenshot(".artifacts/draft-reliability/recovered.png");
}

describe("초안 재실행·복구", () => {
  it(
    "취소한 첫 확인을 다시 열지 않고 손상 초안 한 건만 격리한다",
    cancelledPreparationAfterRestart,
  );
  it(
    "프로세스 재시작 후에도 원문 선택을 정확히 확인한다",
    sourceScopeAfterRestart,
  );
  it(
    "손상 입력을 잠그고 원본을 보여준 뒤 명시적 초기화 성공 시 입력을 다시 연다",
    quarantinedDraftRecovery,
  );
});

async function assertLockedCandidate() {
  assert.equal(
    await browser.execute(() => {
      const field = document.querySelector(".candidate-form textarea");
      field.focus();
      return (
        document.querySelector(".candidate-form form").inert &&
        document.activeElement !== field
      );
    }),
    true,
  );
}
