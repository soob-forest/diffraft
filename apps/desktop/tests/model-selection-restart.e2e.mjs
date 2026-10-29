import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  beginRequest,
  createTask,
  currentDocument,
  terminal,
} from "./support/generation-fixture.mjs";
import { invoke, root } from "./support/review-fixture.mjs";

describe("모델 저장·실패·재시도와 앱 재시작", () => {
  it("재시작 후 선택을 복원하고 실패 요청은 기본값 변경 뒤에도 같은 모델로 재시도한다", async () => {
    await $("button=AI 연결 설정").click();
    await $("#default-model").waitForEnabled();
    assert.equal(await $("#default-model").getValue(), "opus");
    await $("button=설정 닫기").click();
    await $("button=새 문서").click();
    const task = await createTask("모델 계약 확인");
    const before = await currentDocument();
    await writeFile(join(root, "expected-model"), "opus");
    await beginRequest("EXPLAIN", "MODEL_DENIED", "모델 접근 제한 검사");
    const failed = await terminal(task);
    assert.equal((await currentDocument()).content, before.content);
    assert.equal(failed.messages.length, 1);
    assert.equal(failed.lastAttempt.errorCode, "RATE_OR_POLICY");
    assert.equal(failed.lastAttempt.request.value.model, "opus");
    await $(".attempt-recovery").waitForDisplayed();
    await $(".attempt-recovery .request-model").scrollIntoView();
    assert.match(await $(".attempt-recovery").getText(), /요청 모델: Opus/);
    await browser.saveScreenshot(".artifacts/models/model-denied.png");
    await invoke("model_settings_command", {
      request: { schemaVersion: 1, action: { kind: "save", model: "haiku" } },
    });
    await writeFile(join(root, "next-generation"), "EXPLAIN");
    await $("button=마지막 요청 다시 실행").waitForEnabled();
    await $("button=마지막 요청 다시 실행").click();
    const retried = await terminal(task, failed.lastAttempt.jobId);
    assert.equal(retried.lastAttempt.status, "SUCCEEDED");
    assert.equal(retried.lastAttempt.request.value.model, "opus");
    assert.equal(
      JSON.parse(await readFile(join(root, "model-observation.json"), "utf8"))
        .model,
      "opus",
    );
    await writeFile(join(root, "expected-model"), "haiku");
    await beginRequest("EXPLAIN", "EXPLAIN", "새 요청의 모델 확인");
    const fresh = await terminal(task, retried.lastAttempt.jobId);
    assert.equal(fresh.lastAttempt.status, "SUCCEEDED");
    assert.equal(fresh.lastAttempt.request.value.model, "haiku");
    assert.equal(fresh.messages.length, 5);
    await $(".attempt-recovery").waitForExist({ reverse: true });
    await $("button=생성 중단").waitForExist({ reverse: true });
    await browser.saveScreenshot(".artifacts/models/model-success.png");
  });

  it("확인·실행 중 설정이 바뀌어도 요청 모델을 유지하고 중단 결과는 등록하지 않는다", async () => {
    const task = await createTask("모델 고정과 중단 경합");
    const before = await currentDocument();
    await $("button=설명만").click();
    await $(".request-form textarea").setValue("모델 고정 확인");
    await $("button=요청 내용 확인").click();
    await $(".generation-dialog").waitForDisplayed();
    assert.match(await $(".generation-dialog").getText(), /요청 모델: Haiku/);
    await browser.saveScreenshot(".artifacts/models/request-confirmation.png");
    await saveModel("sonnet");
    await writeFile(join(root, "expected-model"), "haiku");
    await writeFile(join(root, "next-generation"), "EXPLAIN_CANCEL_RACE");
    await $("button=확인 후 요청").click();
    await browser.waitUntil(async () => {
      try {
        return (
          (await readFile(join(root, "generation-ready"), "utf8")) === task
        );
      } catch (error) {
        if (error.code === "ENOENT") return false;
        throw error;
      }
    });
    await saveModel("opus");
    await $("button=생성 중단").click();
    const cancelled = await terminal(task);
    assert.equal(cancelled.lastAttempt.status, "CANCELLED");
    assert.equal(cancelled.lastAttempt.request.value.model, "haiku");
    assert.equal(cancelled.messages.length, 1);
    assert.equal((await currentDocument()).content, before.content);
  });
});

async function saveModel(model) {
  await invoke("model_settings_command", {
    request: { schemaVersion: 1, action: { kind: "save", model } },
  });
}
