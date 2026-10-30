import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Key } from "webdriverio";
import {
  addReviewComment,
  copyAndAssert,
  openExport,
  prepareExportReview,
  saveCopy,
  waitVersion,
} from "./support/export-fixture.mjs";
import { inspectExportLayout } from "./support/export-layout.mjs";
import { conversation, review } from "./support/generation-fixture.mjs";
import { editor, examples, invoke, root } from "./support/review-fixture.mjs";
import {
  chooseGroup,
  openDocumentMenu,
  openRegenerate,
  showSummary,
} from "./support/review-ui.mjs";

let fixture;
let confirmed;
describe("확정본 내보내기와 작업 파일 저장", () => {
  afterEach(async function () {
    if (this.currentTest.state === "failed") {
      await mkdir(".artifacts", { recursive: true });
      await browser.saveScreenshot(".artifacts/export-failed.png");
    }
  });
  it("실제 생성 경로의 B01·코멘트·대화를 제외하고 v12만 복사·저장한다", async () => {
    fixture = await prepareExportReview("review");
    await addReviewComment();
    await openExport();
    assert.match(await $(".export-dialog").getText(), /미승인 3건은 제외/);
    await $(".export-preview .markdown-preview").waitForDisplayed();
    assert.match(
      await $(".export-preview .markdown-preview").getText(),
      /10분/,
    );
    await $(".export-preview-toggle input").click();
    assert.equal(await $(".export-preview textarea").getValue(), fixture.base);
    await copyAndAssert(fixture.base);
    await saveCopy("export-copy", fixture.base);
    assert.equal(
      (
        await editor({ kind: "read", documentId: fixture.documentId })
      ).document.path.endsWith("review.md"),
      true,
    );
    await $("button=내보내기 닫기").click();
    assert.equal(
      await browser.execute(() =>
        document.activeElement?.getAttribute("data-testid"),
      ),
      "export-open",
    );
  });
  it("좁은 창·150%에서 내보내기를 읽고 키보드로 닫아 포커스를 복원한다", async () => {
    await inspectExportLayout();
  });
  it("D02 거절→D01 승인→D03 재제안·승인 뒤 v14를 내보낸다", async () => {
    await chooseGroup(2);
    await $("button=선택한 변경 거절").click();
    await browser.waitUntil(
      async () =>
        (await $('[data-testid="diff-stats"]').getText()) === "+2 / −2",
    );
    await chooseGroup(1);
    await $("button=선택한 변경 승인").click();
    await waitVersion(13);
    await openRegenerate();
    await $(".regenerate-form textarea").setValue("코멘트를 반영해 주세요.");
    await writeFile(join(root, "next-generation"), "REGENERATE");
    await $("button=재제안 요청").click();
    await $("button=확인 후 재제안").waitForDisplayed();
    await $("button=확인 후 재제안").click();
    await browser.waitUntil(async () =>
      (await $(".candidate-form summary").getProperty("textContent")).includes(
        "r2",
      ),
    );
    await showSummary();
    await browser.waitUntil(
      async () => await $("button=선택한 변경 승인").isEnabled(),
    );
    await $("button=선택한 변경 승인").click();
    await waitVersion(14);
    confirmed = await readFile(new URL("confirmed_v14.md", examples), "utf8");
    assert.equal(await readFile(join(root, "review.md"), "utf8"), confirmed);
    await openExport();
    await copyAndAssert(confirmed);
    await writeFile(join(root, "export-existing.md"), "교체될 테스트 사본");
    await saveCopy("export-existing", confirmed);
    assert.equal((await conversation(fixture.taskId)).messages.length, 4);
    await mkdir(".artifacts", { recursive: true });
    await browser.saveScreenshot(".artifacts/export-v14.png");
  });
  it("작업 파일 저장 취소와 경로 변경 뒤에도 ID·이력·기존 파일을 유지한다", async () => {
    await changeWorkingFile();
    await $("button=내보내기 닫기").click();
    await openDocumentMenu();
    await $(".document-location summary").click();
    assert.match(await $(".document-path").getText(), /export-working\.md$/);
    const state = await editor({
      kind: "read",
      documentId: fixture.documentId,
    });
    assert.equal(state.document.id, fixture.documentId);
    assert.equal(state.tasks[0].id, fixture.taskId);
    assert.equal(state.versions.length, 14);
    await $("button=원문").click();
    await $('[data-testid="source-editor"]').click();
    await browser.keys([Key.Command, Key.ArrowDown]);
    await browser.keys(Key.Enter);
    await browser.keys(Key.Enter);
    const next = `${confirmed}\n\n경로 변경 후 직접 입력`;
    await browser.keys("경로 변경 후 직접 입력");
    await openExport();
    await waitVersion(15);
    await $(".export-preview-toggle input").click();
    assert.equal(await $(".export-preview textarea").getValue(), next);
    assert.equal(await readFile(join(root, "export-working.md"), "utf8"), next);
    assert.equal(await readFile(join(root, "review.md"), "utf8"), confirmed);
    await $("button=내보내기 닫기").click();
    await writeFile(
      join(root, "export-expected.json"),
      JSON.stringify({
        ...fixture,
        content: next,
        processId: await invoke("e2e_process_id", {}),
      }),
    );
  });
  it("전체 승인 확인 중 외부 변경이면 반영 0건이며 내보내기도 차단한다", async () => {
    const failure = await prepareExportReview("conflict-review");
    await $("button=남은 제안 전체 승인").click();
    await $(".approval-dialog[open]").waitForDisplayed();
    await writeFile(join(root, "conflict-review.md"), "외부 원문 유지");
    await browser.waitUntil(
      async () => !(await $(".approval-dialog[open]").isExisting()),
    );
    await $("button=확정본 내보내기").click();
    await browser.waitUntil(async () =>
      (await $(".export-feedback").getText()).includes("외부"),
    );
    assert.equal(await $(".export-dialog[open]").isExisting(), false);
    const state = await editor({
      kind: "read",
      documentId: failure.documentId,
    });
    assert.equal(state.document.content, failure.base);
    assert.equal(state.document.version, 12);
    assert.equal(
      await readFile(join(root, "conflict-review.md"), "utf8"),
      "외부 원문 유지",
    );
    assert.equal((await review(failure.taskId)).batches[0].status, "ACTIVE");
  });
});

async function changeWorkingFile() {
  await $(".export-working summary").click();
  await writeFile(join(root, "next-export"), "cancel");
  await $("button=다른 이름으로 작업 파일 저장").click();
  await browser.waitUntil(async () =>
    (await $(".export-dialog [role=status]").getText()).includes("취소"),
  );
  assert.match(
    (await editor({ kind: "read", documentId: fixture.documentId })).document
      .path,
    /review\.md$/,
  );
  await writeFile(join(root, "next-export"), "export-working");
  await $("button=다른 이름으로 작업 파일 저장").click();
  await browser.waitUntil(async () =>
    (await $(".export-dialog [role=status]").getText()).includes(
      "경로 변경 완료",
    ),
  );
}
