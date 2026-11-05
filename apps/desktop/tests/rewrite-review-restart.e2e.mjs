import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { openExport, saveCopy } from "./support/export-fixture.mjs";
import {
  requestRewrite,
  start,
  waitCandidate,
} from "./support/rewrite-fixture.mjs";
import {
  chooseUnit,
  current,
  editor,
  invoke,
  openRemainingApproval,
  root,
  showUnitComment,
  unitDecision,
} from "./support/unit-review-fixture.mjs";

describe("변경별 검토 재실행", () => {
  afterEach(async function () {
    if (this.currentTest.state === "failed")
      await writeFile(
        ".artifacts/unit-review/after/restart-focus.json",
        JSON.stringify(
          await browser.execute(() => ({
            tag: document.activeElement?.tagName,
            classes: document.activeElement?.className,
            dialog: !!document.querySelector("dialog[open]"),
          })),
        ),
      );
  });
  it(
    "같은 단위와 초안을 복원하고 거절 재검토·남은 승인 뒤 승인 내용만 내보낸다",
    verifyResumeReviewAndExport,
  );
  it(
    "최신 확정본의 새 요청과 확인 중 외부 변경은 거절을 우회하지 않는다",
    verifyExternalChangeCancelsApproval,
  );
});

async function verifyResumeReviewAndExport() {
  const fixture = JSON.parse(
    await readFile(join(root, "unit-expected.json"), "utf8"),
  );
  assert.notEqual(await invoke("e2e_process_id", {}), fixture.processId);
  await $("button=변경 검토").click();
  await $(".unit-review").waitForDisplayed();
  assert.equal(await $(".unit-picker select").getValue(), fixture.selected);
  await showUnitComment();
  assert.equal(
    await $(".unit-comments textarea").getValue(),
    "재실행 뒤 이어 쓸 의견",
  );
  await $("button=코멘트 저장").click();
  await browser.waitUntil(
    async () => (await $(".unit-comments textarea").getValue()) === "",
  );
  const view = await current(fixture);
  await chooseUnit(view.batch.reviewUnits[1].id);
  await $(".unit-actions").$("button=다시 검토").waitForEnabled();
  await $(".unit-actions").$("button=다시 검토").click();
  await browser.waitUntil(
    async () =>
      (await current(fixture)).batch.reviewUnits[1].reviewRevision === 2,
  );
  assert.equal(
    (await editor({ kind: "read", documentId: fixture.document.id })).document
      .version,
    15,
  );
  await unitDecision("거절", fixture, 1, "REJECTED");
  await browser.waitUntil(async () =>
    (await $(".unit-feedback").getText()).includes("거절 완료"),
  );
  await finishReviewAndExport(fixture);
}

async function verifyExternalChangeCancelsApproval() {
  const fixture = JSON.parse(
    await readFile(join(root, "unit-expected.json"), "utf8"),
  );
  await requestRewrite();
  await start("REWRITE_UNITS");
  fixture.batch = await waitCandidate(fixture.task.id, 2);
  await $("button=변경별 검토 시작").waitForEnabled();
  await $("button=변경별 검토 시작").click();
  await $(".unit-review").waitForDisplayed();
  await openRemainingApproval(1);
  await writeFile(join(root, "rewrite.md"), "외부 변경 보존\n");
  await browser.waitUntil(
    async () => !(await $(".approval-dialog[open]").isExisting()),
  );
  assert.equal(
    (await editor({ kind: "read", documentId: fixture.document.id })).document
      .version,
    16,
  );
  assert.equal(
    await readFile(join(root, "rewrite.md"), "utf8"),
    "외부 변경 보존\n",
  );
  const view = await current(fixture);
  assert.equal(
    view.batch.proposals.filter((p) => p.decision === "ACCEPTED").length,
    0,
  );
}

async function finishReviewAndExport(fixture) {
  await openRemainingApproval(1);
  assert.match(await $(".approval-dialog").getText(), /1개 변경/);
  await $("button=확인 후 승인·저장").click();
  await browser.waitUntil(
    async () =>
      (await editor({ kind: "read", documentId: fixture.document.id })).document
        .version === 16,
  );
  const view = await current(fixture);
  await browser.waitUntil(async () =>
    (await $(".unit-feedback").getText()).includes("v16 저장됨"),
  );
  assert.match(view.before, /바로 실행하는/);
  assert.match(view.before, /10분/);
  assert.doesNotMatch(view.before, /20분/);
  assert.match(view.before, /여행 기록을 마치면/);
  assert.equal(view.groups.length, 0);
  await browser.waitUntil(async () =>
    browser.execute(() =>
      document.activeElement?.matches(".unit-progress strong"),
    ),
  );
  await openExport();
  await saveCopy("export-copy", view.before);
  await $("button=내보내기 닫기").click();
  assert.equal(await readFile(join(root, "rewrite.md"), "utf8"), view.before);
  await writeFile(join(root, "unit-reviewed"), "verified");
}
