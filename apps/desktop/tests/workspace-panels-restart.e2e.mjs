import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const root = process.env.DOCREVIEW_E2E_DATA;
describe("완료 문서 목록 재실행", () => {
  it("재실행 후에도 제거를 유지하고 같은 파일을 열면 기존 문서와 이력을 복구한다", async () => {
    const expected = JSON.parse(
      await readFile(join(root, "workspace-panels-expected.json"), "utf8"),
    );
    await $(".empty-state").waitForDisplayed();
    await browser.waitUntil(
      async () =>
        (await $('[data-testid="workspace-status"]').getText()) ===
        "로컬 작업 공간",
    );
    assert.equal(
      await $(
        '.sidebar > ul .document-list-row button[aria-label="document 문서 작업"]',
      ).isExisting(),
      false,
    );
    await writeFile(join(root, "next-pick"), "document");
    if (!(await $(".sidebar").isDisplayed()))
      await $('.app-header button[aria-controls="document-list"]').click();
    await $("button=문서 열기").click();
    await browser.waitUntil(
      async () => (await $(".document-toolbar h1").getText()) === "document",
    );
    const restored = await browser.execute(() =>
      window.__TAURI__.core.invoke("get_workspace_snapshot", {
        request: { schemaVersion: 1 },
      }),
    );
    assert.deepEqual(restored.documents, expected.documents);
    assert.equal(
      await readFile(join(root, "document.md"), "utf8"),
      expected.original,
    );
    await browser.saveScreenshot(".artifacts/workspace-panels/reopened.png");
  });
});
