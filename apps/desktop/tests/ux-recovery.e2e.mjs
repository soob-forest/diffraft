import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Key } from "webdriverio";
import { checkDraftRecoveryLayouts } from "./support/draft-recovery-layout.mjs";
import { editor, prepare, root } from "./support/review-fixture.mjs";
import { chooseGroup } from "./support/review-ui.mjs";
import {
  currentBatch,
  selectDiffText,
  storedSelection,
} from "./support/ux-ui.mjs";

let fixture, first, second, secondKey;
const firstInstruction = "A 문장의 의미를 유지하고 쉽게 다듬기";
const secondInstruction = "B 문장의 별도 초안 보존";
const indexKey = () =>
  JSON.stringify([
    "selected-request",
    fixture.document.id,
    fixture.task.id,
    "active",
  ]);
async function savedDrafts() {
  await browser.waitUntil(async () =>
    (await $("footer .draft-status").getText()).includes("저장됨"),
  );
  return editor({ kind: "read_drafts" });
}
async function startSelection(proposal, number, offset = 0) {
  await chooseGroup(number);
  await selectDiffText(proposal.operation.after);
  if (offset) {
    await browser.keys(Key.ArrowRight);
    await browser.keys([
      Key.Shift,
      Key.ArrowRight,
      Key.ArrowRight,
      Key.ArrowRight,
    ]);
  }
  await $(".selection-context").$("button=이 부분 수정").click();
  await browser.waitUntil(
    async () =>
      (await $("button=기존 초안 보관하고 새 대상 작성").isExisting()) ||
      (await $(".selected-request-form blockquote").getText()).trim() ===
        proposal.operation.after.slice(offset, offset + 3).trim(),
  );
  const replace = $("button=기존 초안 보관하고 새 대상 작성");
  if (await replace.isExisting()) await replace.click();
  await $(".selected-request-form textarea").waitForDisplayed();
  await browser.waitUntil(
    async () => {
      const target = await storedSelection(fixture);
      return (
        target.proposalId === proposal.id &&
        target.selection.fromUtf16 === offset
      );
    },
    { timeoutMsg: "새 선택 대상이 저장된 뒤 지시를 입력해야 합니다." },
  );
}
async function closeSelection() {
  await $(".selected-request-form").$("button=변경 상세로 돌아가기").click();
}
async function confirm(mode) {
  await writeFile(join(root, "next-generation"), mode);
  await $(".selected-request-form").$("button=요청 내용 확인").click();
  await $(".selection-confirmation").waitForDisplayed();
  await $(".selection-confirmation").$("button=확인 후 요청").waitForEnabled();
  await $(".selection-confirmation").$("button=확인 후 요청").click();
}

describe("선택 대상과 초안 복구 회귀", () => {
  afterEach(async function () {
    if (this.currentTest.state !== "failed") return;
    await mkdir(".artifacts/ux-followup", { recursive: true });
    await browser.saveScreenshot(".artifacts/ux-followup/failure.png");
    await writeFile(
      ".artifacts/ux-followup/failure.json",
      JSON.stringify({
        step: this.currentTest.title,
        drafts: await editor({ kind: "read_drafts" }),
        ui: await browser.execute(() => ({
          statuses: [...document.querySelectorAll("[role=status]")].map(
            (node) => node.textContent,
          ),
          instruction: document
            .querySelector(".selected-request-form textarea")
            ?.value.slice(0, 100),
        })),
      }),
    );
  });
  it("A 실패 후 B 초안을 보존하고 A의 복구 버튼으로 정확한 초안을 연다", async () => {
    await mkdir(".artifacts/ux-followup", { recursive: true });
    fixture = await prepare("regeneration-late");
    first = fixture.batch.proposals.find((p) =>
      p.operation.headingPath.at(-1).startsWith("1."),
    );
    second = fixture.batch.proposals.find((p) =>
      p.operation.headingPath.at(-1).startsWith("2."),
    );
    await startSelection(first, 1);
    await $(".selected-request-form textarea").setValue(firstInstruction);
    await confirm("REGENERATE_WRONG_SELECTION");
    await browser.waitUntil(async () =>
      (await $(".selected-request-form").getText()).includes("범위가 맞지"),
    );
    await closeSelection();
    await startSelection(first, 1, 3);
    await $(".selected-request-form textarea").setValue(secondInstruction);
    const before = await savedDrafts();
    secondKey = JSON.parse(
      before.find((record) => record.key === indexKey()).valueJson,
    ).key;
    await $(".panel-tabs").$("button=작업·대화").click();
    await $(".attempt-recovery").$("button=선택 수정 초안 열기").click();
    await $(".selected-request-form textarea").waitForDisplayed();
    await browser.waitUntil(
      async () =>
        (await $(".selected-request-form textarea").getValue()) ===
        firstInstruction,
      { timeoutMsg: "실패한 A 요청의 초안으로 전환되어야 합니다." },
    );
    assert.equal(
      await $(".selected-request-form textarea").getValue(),
      firstInstruction,
    );
    assert.equal((await storedSelection(fixture)).proposalId, first.id);
    const after = await savedDrafts();
    assert.equal(
      JSON.parse(after.find((record) => record.key === secondKey).valueJson)
        .instruction,
      secondInstruction,
    );
  });

  it("다른 그룹 승인 뒤 같은 범위를 재선택하면 최신 기준으로 성공한다", async () => {
    await closeSelection();
    await chooseGroup(2);
    await $("button=선택한 변경 승인").waitForEnabled();
    await $("button=선택한 변경 승인").click();
    await browser.waitUntil(async () => {
      const state = await editor({
        kind: "read",
        documentId: fixture.document.id,
      });
      return state.document.versionId !== fixture.batch.applyHeadId;
    });
    const state = await editor({
      kind: "read",
      documentId: fixture.document.id,
    });
    fixture.batch.applyHeadId = state.document.versionId;
    await startSelection(first, 1);
    await browser.waitUntil(
      async () =>
        (await $(".selected-request-form textarea").getValue()) ===
        firstInstruction,
      { timeoutMsg: "A 문장을 재선택하면 기존 지시가 복원되어야 합니다." },
    );
    assert.equal(
      await $(".selected-request-form textarea").getValue(),
      firstInstruction,
    );
    assert.equal(
      (await storedSelection(fixture)).expectedHeadId,
      state.document.versionId,
    );
    assert.equal(await $(".selection-confirmation").isExisting(), false);
    await confirm("REGENERATE");
    await browser.waitUntil(
      async () =>
        (await currentBatch(fixture)).proposals.find((p) => p.id === first.id)
          .revision === 2,
    );
    assert.equal(
      (await currentBatch(fixture)).proposals.find((p) => p.id === second.id)
        .decision,
      "ACCEPTED",
    );
    assert.equal(
      (await editor({ kind: "read", documentId: fixture.document.id })).document
        .content,
      state.document.content,
    );
  });

  it("크기 초과 초안은 이동을 막고 해당 입력만 비운 뒤 저장·이동을 재개한다", async () => {
    await $("button=원문").click();
    await $(".request-form textarea").waitForEnabled();
    await browser.execute(() => {
      const textarea = document.querySelector(".request-form textarea");
      const setter = Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype,
        "value",
      ).set;
      setter.call(textarea, "\\".repeat(1600 * 1024));
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await browser.waitUntil(async () =>
      (await $("footer .draft-status").getText()).includes("크기"),
    );
    await $(".document-actions").$("button=새 문서").click();
    assert.equal(
      await $(".document-toolbar h1").getText(),
      fixture.document.title,
    );
    await browser.saveScreenshot(
      ".artifacts/ux-followup/oversized-recovery.png",
    );
    await checkDraftRecoveryLayouts();
    await $("footer").$("button=크기 초과 초안 비우기").click();
    await savedDrafts();
    assert.equal(await $(".request-form textarea").getValue(), "");
    const records = await savedDrafts();
    assert.equal(
      JSON.parse(records.find((record) => record.key === secondKey).valueJson)
        .instruction,
      secondInstruction,
    );
    await $(".document-actions").$("button=새 문서").click();
    await browser.waitUntil(
      async () => (await $(".document-toolbar h1").getText()) === "새 문서",
    );
  });
});
