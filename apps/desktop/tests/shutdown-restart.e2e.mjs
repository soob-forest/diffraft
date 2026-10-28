import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { conversation } from "./support/generation-fixture.mjs";
import { editor, invoke, root } from "./support/review-fixture.mjs";

describe("정상 종료 후 보존", () => {
  it("마지막 원문·작업 조건·취소한 요청을 재시작해 읽는다", async () => {
    const expected = JSON.parse(
      await readFile(join(root, "shutdown-expected.json"), "utf8"),
    );
    assert.notEqual(await invoke("e2e_process_id", {}), expected.pid);
    await $(".sidebar ul").$("button=새 문서").click();
    await $('[data-testid="source-editor"]').waitForDisplayed();
    const state = await editor({
      kind: "read",
      documentId: expected.documentId,
    });
    assert.equal(state.document.content, expected.content);
    assert.equal(state.tasks[0].goal, expected.goal);
    const page = await conversation(expected.taskId);
    assert.equal(page.lastAttempt.status, "CANCELLED");
    assert.equal(
      page.messages.filter((value) => value.role === "ASSISTANT").length,
      0,
    );
    assert.equal(
      (await invoke("generation_snapshot", { request: { schemaVersion: 1 } }))
        .operationId,
      null,
    );
  });
});
