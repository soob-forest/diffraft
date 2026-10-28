import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { copyAndAssert, openExport } from "./support/export-fixture.mjs";
import { conversation } from "./support/generation-fixture.mjs";
import { editor, invoke, root } from "./support/review-fixture.mjs";

describe("작업 파일 변경 후 별도 프로세스 재개", () => {
  it("새 경로·같은 문서/작업·확정본·대화를 복원하고 다시 복사한다", async () => {
    const expected = JSON.parse(
      await readFile(join(root, "export-expected.json"), "utf8"),
    );
    assert.notEqual(await invoke("e2e_process_id", {}), expected.processId);
    await $(".sidebar ul").$("button=review").click();
    await browser.waitUntil(
      async () => (await $(".version-badge").getText()) === "v15",
    );
    const state = await editor({
      kind: "read",
      documentId: expected.documentId,
    });
    assert.equal(state.document.content, expected.content);
    assert.equal(state.document.version, 15);
    assert.match(state.document.path, /export-working\.md$/);
    assert.equal(state.tasks[0].id, expected.taskId);
    assert.equal((await conversation(expected.taskId)).messages.length, 4);
    await openExport();
    await copyAndAssert(expected.content);
  });
});
