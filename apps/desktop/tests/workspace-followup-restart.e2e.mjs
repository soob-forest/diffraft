import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { editor, invoke, root } from "./support/review-fixture.mjs";
import { resizeContent } from "./support/tobe-fixture.mjs";

describe("재실행 후 완료 문서 복구", () => {
  it("좁은 창에서도 파일 선택 없이 기존 ID·버전으로 복구한다", async () => {
    const saved = JSON.parse(
      await readFile(join(root, "workspace-followup.json"), "utf8"),
    );
    await resizeContent(800, 900);
    await $('.app-header button[aria-controls="document-list"]').click();
    await $(".completed-documents > summary").click();
    await $(
      '.completed-documents button[aria-label="새 문서 다시 열기"]',
    ).click();
    await browser.waitUntil(
      async () => (await $(".document-toolbar h1").getText()) === "새 문서",
    );
    const snapshot = await invoke("get_workspace_snapshot", {
      request: { schemaVersion: 1 },
    });
    assert.equal(snapshot.selectedDocumentId, saved.document.id);
    const restored = await editor({
      kind: "read",
      documentId: saved.document.id,
    });
    assert.equal(restored.document.content, saved.document.content);
    assert.deepEqual(restored.versions, saved.versions);
    assert.equal(await $(".sidebar").isDisplayed(), false);
    await browser.waitUntil(async () =>
      browser.execute(() =>
        Boolean(document.activeElement?.closest(".source-editor")),
      ),
    );
    await browser.saveScreenshot(
      ".artifacts/workspace-followup/restored-narrow.png",
    );
  });
});
