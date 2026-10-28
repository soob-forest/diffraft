import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  beginRequest,
  chooseTask,
  conversation,
  createTask,
  currentDocument,
  review,
  terminal,
} from "./support/generation-fixture.mjs";
import { invoke, root } from "./support/review-fixture.mjs";

let taskId;
let document;
let lastJob;
let batchId;
describe("범위 요청·대화·수동 재개", () => {
  afterEach(async function () {
    if (this.currentTest.state !== "failed") return;
    await mkdir(".artifacts", { recursive: true });
    await browser.saveScreenshot(".artifacts/generation-test-failed.png");
  });
  it("저장하지 않은 작업/공통 조건을 먼저 저장하고 설명은 대화에만 남긴다", async () => {
    await $("button=새 문서").click();
    await $(".source-editor .cm-content").waitForExist();
    document = await currentDocument();
    taskId = await createTask("초기 목표");
    await $(".task-conditions textarea[required]").setValue("최신 목표");
    await $(".task-conditions textarea:not([required])").setValue(
      "수치는 유지",
    );
    await $(".common-rules summary").click();
    await browser.waitUntil(
      async () => await $(".common-rules textarea").isEnabled(),
    );
    await $(".common-rules textarea").setValue("독자는 여행자");
    await beginRequest("EXPLAIN", "EXPLAIN_CONTEXT", "조건을 확인해 주세요");
    const page = await terminal(taskId);
    lastJob = page.lastAttempt.jobId;
    assert.equal(page.lastAttempt.status, "SUCCEEDED");
    assert.equal(
      page.messages.at(-1).content,
      "최신 목표 / 수치는 유지 / 독자는 여행자",
    );
    assert.equal(page.session, "CONNECTED");
    assert.equal((await review(taskId)).batches.length, 0);
    assert.equal(await readFile(document.path, "utf8"), "");
  });
  it("빈 문서의 첫 제안을 미승인으로 만들고 형식 오류 때 이전 제안을 유지한다", async () => {
    await beginRequest("PATCH", "PATCH_SCOPE", "첫 원문 작성");
    const page = await terminal(taskId, lastJob);
    lastJob = page.lastAttempt.jobId;
    assert.equal(page.lastAttempt.status, "SUCCEEDED");
    batchId = (await review(taskId)).batches[0].id;
    await $('[data-testid="diff-stats"]').waitForDisplayed();
    assert.equal(await readFile(document.path, "utf8"), "");
    await beginRequest("PATCH", "STRUCTURED_LIMIT", "다른 제안 작성");
    const failed = await terminal(taskId, lastJob);
    lastJob = failed.lastAttempt.jobId;
    assert.equal(failed.lastAttempt.errorCode, "OUTPUT_INVALID");
    assert.equal(
      (await review(taskId)).batches.find((batch) => batch.status === "ACTIVE")
        .id,
      batchId,
    );
    await mkdir(".artifacts", { recursive: true });
    await browser.saveScreenshot(".artifacts/generation-failure.png");
    await browser.waitUntil(async () =>
      (await $(".attempt-failure").getText()).includes("응답 형식"),
    );
    assert.doesNotMatch(
      await $(".attempt-failure").getText(),
      /synthetic private/,
    );
    await writeFile(join(root, "next-generation"), "PATCH_SCOPE");
    await $("button=마지막 요청 다시 실행").click();
    const retried = await terminal(taskId, lastJob);
    assert.equal(retried.lastAttempt.status, "SUCCEEDED");
    assert.equal(retried.lastAttempt.request.value.retryOf, lastJob);
    lastJob = retried.lastAttempt.jobId;
    batchId = (await review(taskId)).batches.find(
      (batch) => batch.status === "ACTIVE",
    ).id;
    assert.equal(await readFile(document.path, "utf8"), "");
  });
  it("세션 유실을 표시하고 명시적 재시도로 로컬 맥락의 새 대화를 시작한다", async () => {
    await beginRequest("EXPLAIN", "SESSION_MISSING", "이전 대화를 이어 주세요");
    const missing = await terminal(taskId, lastJob);
    lastJob = missing.lastAttempt.jobId;
    assert.equal(missing.session, "MISSING");
    assert.equal(missing.lastAttempt.errorCode, "SESSION_MISSING");
    await browser.waitUntil(async () =>
      (await $(".session-state").getText()).includes("찾지 못했습니다"),
    );
    await writeFile(join(root, "next-generation"), "EXPLAIN_FRESH");
    await $("button=마지막 요청 다시 실행").click();
    const retried = await terminal(taskId, lastJob);
    assert.equal(retried.lastAttempt.status, "SUCCEEDED");
    assert.equal(retried.lastAttempt.request.value.retryOf, lastJob);
    lastJob = retried.lastAttempt.jobId;
    assert.equal(retried.session, "CONNECTED");
    assert.equal(retried.messages.at(-1).content, "확인 시간은 10분입니다.");
  });
  it("중단한 요청의 늦은 결과를 버리고 다른 작업의 대화를 섞지 않는다", async () => {
    await beginRequest("EXPLAIN", "EXPLAIN_CANCEL_RACE", "중단할 요청");
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
    const runningJob = (await conversation(taskId)).lastAttempt.jobId;
    await $(`button[data-operation-id='${runningJob}']`).waitForDisplayed();
    await $("button=생성 중단").click();
    const cancelled = await terminal(taskId, lastJob);
    lastJob = cancelled.lastAttempt.jobId;
    assert.equal(cancelled.lastAttempt.status, "CANCELLED");
    assert.equal(
      cancelled.messages.filter(
        (message) => message.jobId === lastJob && message.role === "ASSISTANT",
      ).length,
      0,
    );
    const other = await createTask("다른 작업");
    assert.equal((await conversation(other)).messages.length, 0);
    await chooseTask(taskId);
    await browser.waitUntil(async () =>
      (await $(".conversation-messages").getText()).includes("조건을 확인"),
    );
    assert.equal(await readFile(document.path, "utf8"), "");
    await writeFile(
      join(root, "generation-expected.json"),
      JSON.stringify({
        documentId: document.id,
        taskId,
        batchId,
        lastJob,
        processId: await invoke("e2e_process_id", {}),
        messages: (await conversation(taskId)).messages,
      }),
    );
    await browser.saveScreenshot(".artifacts/generation-conversation.png");
  });
});
