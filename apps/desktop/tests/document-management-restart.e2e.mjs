import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { editor, invoke, root } from "./support/review-fixture.mjs";
import { resizeContent } from "./support/tobe-fixture.mjs";

describe("완전히 제거한 문서 재실행", () => {
  it("양쪽 목록에서 제거를 유지하고 명시적으로 같은 파일을 열면 ID와 이력을 복구한다", async () => {
    const saved = JSON.parse(
      await readFile(join(root, "document-management.json"), "utf8"),
    );
    await resizeContent(1440, 900);
    await $(
      '.app-header button[aria-controls="document-list"]',
    ).waitForDisplayed();
    await browser.waitUntil(
      async () =>
        (await $('[data-testid="workspace-status"]').getText()) ===
        "로컬 작업 공간",
    );
    assert.equal(
      await $('.document-more[aria-label="document 문서 작업"]').isExisting(),
      false,
    );
    await writeFile(join(root, "next-pick"), "document");
    await $(".document-actions").$("button=문서 열기").click();
    await browser.waitUntil(
      async () => (await $(".document-toolbar h1").getText()) === "document",
    );
    const snapshot = await invoke("get_workspace_snapshot", {
      request: { schemaVersion: 1 },
    });
    assert.equal(snapshot.selectedDocumentId, saved.document.id);
    const restored = await editor({
      kind: "read",
      documentId: saved.document.id,
    });
    assert.deepEqual(restored.versions, saved.versions);
    assert.equal(restored.document.content, saved.document.content);
    assert.equal(
      await readFile(join(root, "document.md"), "utf8"),
      saved.document.content,
    );
    await browser.saveScreenshot(".artifacts/document-management/reopened.png");
  });
});
