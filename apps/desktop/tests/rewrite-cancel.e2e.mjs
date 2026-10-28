import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { terminal } from "./support/generation-fixture.mjs";
import {
  confirmed,
  invoke,
  prepareRewrite,
  requestRewrite,
  reviewState,
  root,
  start,
  waitCandidate,
} from "./support/rewrite-fixture.mjs";

async function waitRunning(taskId) {
  await browser.waitUntil(async () => {
    try {
      return (
        (await readFile(join(root, "generation-ready"), "utf8")) === taskId
      );
    } catch (error) {
      if (error.code === "ENOENT") return false;
      throw error;
    }
  });
  await $("button=생성 중단").waitForExist();
}

describe("재작성 요청 중 사용자 통제", () => {
  it("확인창을 닫고 중단 버튼으로 늦은 응답을 거부하며 이전 후보를 보존한다", async () => {
    const fixture = await prepareRewrite();
    await requestRewrite();
    await start("REWRITE");
    const previous = await waitCandidate(fixture.task.id, 1);
    await requestRewrite(true);
    await start("EXPLAIN_CANCEL_RACE");
    await waitRunning(fixture.task.id);
    const operationId =
      await $("button=생성 중단").getAttribute("data-operation-id");
    try {
      assert.equal(await $(".rewrite-request-dialog").isExisting(), false);
      await assertStopAndEditorAccessible();
      await $("button=생성 중단").click();
      const page = await terminal(fixture.task.id);
      assert.equal(page.lastAttempt.status, "CANCELLED");
      assert.equal(
        page.messages.some(
          (message) =>
            message.jobId === operationId && message.role === "ASSISTANT",
        ),
        false,
      );
      assert.equal(
        (await reviewState(fixture.task.id)).batches[0].id,
        previous.id,
      );
      assert.equal(await readFile(join(root, "rewrite.md"), "utf8"), confirmed);
    } finally {
      await invoke("cancel_generation", {
        request: { schemaVersion: 1 },
        operationId,
      });
    }
  });
});

async function assertStopAndEditorAccessible() {
  assert.equal(
    await browser.execute(() => {
      const stop = document.querySelector("button[data-operation-id]");
      stop.focus();
      return document.activeElement === stop;
    }),
    true,
  );
  await $("button=원문").click();
  await $('[data-testid="source-editor"]').click();
  assert.equal(
    await browser.execute(
      () =>
        document.activeElement.matches('[data-testid="source-editor"]') &&
        document.activeElement.isContentEditable,
    ),
    true,
  );
}
