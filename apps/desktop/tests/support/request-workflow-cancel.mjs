import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { terminal } from "./generation-fixture.mjs";
import { root } from "./review-fixture.mjs";

export async function cancelQuestion(taskId) {
  await writeFile(join(root, "next-generation"), "EXPLAIN_CANCEL_RACE");
  await $("button=확인 후 요청").click();
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
  await $("button=생성 중단").waitForDisplayed();
  await $("button=생성 중단").click();
  const page = await terminal(taskId);
  assert.equal(page.lastAttempt.status, "CANCELLED");
  assert.equal(
    page.lastAttempt.request.value.question.subject.kind,
    "proposal",
  );
  assert.equal(
    await $(".request-form textarea").getValue(),
    "이 변경의 이유를 알려 주세요.",
  );
  await $(".request-form button[type=submit]").waitForEnabled();
  return page.lastAttempt.jobId;
}
