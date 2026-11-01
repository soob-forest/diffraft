import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { beginRequest, conversation, terminal } from "./generation-fixture.mjs";
import { invoke } from "./review-fixture.mjs";

export async function nativeCancelAndRetry(state) {
  await beginRequest(
    "EXPLAIN",
    "CODEX_NATIVE",
    "합성 중단·재시도 검증입니다. EXPLAIN으로 연결 확인을 짧게 답하고 도구는 사용하지 마세요.",
  );
  await browser.waitUntil(async () => {
    const last = (await conversation(state.task)).lastAttempt;
    return last && last.jobId !== state.lastJob && last.status === "RUNNING";
  });
  const started = Date.now();
  await $("button=생성 중단").waitForEnabled();
  await $("button=생성 중단").click();
  let page = await terminal(state.task, state.lastJob);
  assert.equal(page.lastAttempt.status, "CANCELLED");
  const elapsed = Date.now() - started;
  assert(elapsed < 10000);
  const cancelled = page.lastAttempt.jobId;
  const model = page.lastAttempt.request.value.model;
  await invoke("ai_settings_command", {
    request: {
      schemaVersion: 1,
      action: { kind: "provider", provider: "claude" },
    },
  });
  await $("button=마지막 요청 다시 실행").waitForEnabled();
  await $("button=마지막 요청 다시 실행").click();
  page = await terminal(state.task, cancelled, 120000);
  assert.equal(page.lastAttempt.status, "SUCCEEDED");
  assert.deepEqual(page.lastAttempt.request.value.model, model);
  assert.equal(page.lastAttempt.request.value.retryOf, cancelled);
  assert.equal(await readFile(state.document.path, "utf8"), state.confirmed);
  state.lastJob = page.lastAttempt.jobId;
  await invoke("ai_settings_command", {
    request: {
      schemaVersion: 1,
      action: { kind: "provider", provider: "codex" },
    },
  });
  await writeFile(
    ".artifacts/codex/native-timing.json",
    JSON.stringify({ cancellationAndCleanupMs: elapsed }),
  );
}
