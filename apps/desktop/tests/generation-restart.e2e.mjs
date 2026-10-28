import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  chooseTask,
  conversation,
  review,
} from "./support/generation-fixture.mjs";
import { invoke, root } from "./support/review-fixture.mjs";

describe("별도 프로세스에서 작업 재개", () => {
  it("대화·세션·실패 요청·미승인 후보를 다시 읽는다", async () => {
    const expected = JSON.parse(
      await readFile(join(root, "generation-expected.json"), "utf8"),
    );
    assert.notEqual(await invoke("e2e_process_id", {}), expected.processId);
    await $(".sidebar ul").$("button=새 문서").click();
    await $(".task-panel > label select").waitForExist();
    await chooseTask(expected.taskId);
    const page = await conversation(expected.taskId);
    assert.deepEqual(page.messages, expected.messages);
    assert.equal(page.session, "CONNECTED");
    assert.equal(page.lastAttempt.jobId, expected.lastJob);
    assert.equal(page.lastAttempt.status, "CANCELLED");
    assert.equal(
      (await review(expected.taskId)).batches.find(
        (batch) => batch.status === "ACTIVE",
      ).id,
      expected.batchId,
    );
    await browser.waitUntil(async () =>
      (await $(".conversation-messages").getText()).includes("조건을 확인"),
    );
    assert.equal(await $("button=마지막 요청 다시 실행").isExisting(), true);
  });
});
