import assert from "node:assert/strict";
import { beginRequest, conversation, terminal } from "./generation-fixture.mjs";
import { openComment } from "./review-ui.mjs";

export async function checkBusyComment(taskId) {
  const previousJob = (await conversation(taskId)).lastAttempt?.jobId;
  await openComment();
  await $(".comment-form textarea").setValue("진행 중에도 유지할 초안");
  await beginRequest("EXPLAIN", "EXPLAIN_DELAY", "상태를 설명해 주세요");
  await openComment();
  await browser.waitUntil(
    async () => !(await $("button=코멘트 저장").isEnabled()),
  );
  assert.equal(
    await $(".comment-form textarea").getValue(),
    "진행 중에도 유지할 초안",
  );
  await browser.saveScreenshot(".artifacts/usability/request-running.png");
  await $("button=생성 중단").click();
  const result = await terminal(taskId, previousJob);
  assert.equal(result.lastAttempt.status, "CANCELLED");
  await $("button=코멘트 저장").waitForEnabled();
  assert.equal(
    await $(".comment-form textarea").getValue(),
    "진행 중에도 유지할 초안",
  );
}
