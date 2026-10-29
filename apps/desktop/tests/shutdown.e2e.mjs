import assert from "node:assert/strict";
import { chmod, readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Key } from "webdriverio";
import {
  assertWindowAliveAtExit,
  waitForNormalExit,
} from "./support/app-exit.mjs";
import { holdDatabase } from "./support/database-lock.mjs";
import {
  beginRequest,
  currentDocument,
} from "./support/generation-fixture.mjs";
import { invoke, root } from "./support/review-fixture.mjs";

it("잘못된 종료 요청 버전은 거부하고 앱을 유지한다", async () => {
  const pid = await invoke("e2e_process_id", {});
  const code = await browser.execute(async () => {
    try {
      await window.__TAURI__.core.invoke("complete_shutdown", {
        request: { schemaVersion: 999 },
      });
      return null;
    } catch (error) {
      return error.code;
    }
  });
  assert.equal(code, "SCHEMA_UNSUPPORTED");
  assert.equal(await invoke("e2e_process_id", {}), pid);
});
it("앱 종료 요청에서도 읽기 전용 저장 실패 시 창과 입력을 유지한다", async () => {
  await writeFile(join(root, "next-pick"), "readonly");
  await $("button=문서 열기").click();
  await browser.waitUntil(
    async () => (await $(".document-toolbar h1").getText()) === "readonly",
  );
  const pid = await invoke("e2e_process_id", {});
  const source = await $('[data-testid="source-editor"]');
  await source.click();
  await browser.keys([Key.Command, "a"]);
  await source.addValue("종료 전에 보존할 입력");
  await browser.waitUntil(
    async () =>
      (await $('[data-testid="save-status"]').getText()) === "원문 저장 중지",
  );
  await invoke("e2e_request_exit", {});
  await invoke("e2e_request_native_exit", {});
  await browser.waitUntil(async () =>
    (await $(".workspace-body").getText()).includes("권한"),
  );
  assert.equal(await invoke("e2e_process_id", {}), pid);
  assert.equal(
    await browser.execute(
      () => document.querySelector(".workspace-body").inert,
    ),
    false,
  );
  assert.match(await source.getText(), /종료 전에 보존할 입력/);
  assert.equal(
    await readFile(join(root, "readonly.md"), "utf8"),
    "# 읽기 전용\n원문 유지\n",
  );
});
it("남은 입력·조건을 저장하고 실행 중인 CLI를 종료한 뒤 앱을 종료한다", async () => {
  await prepareWritableDocument();
  const document = await currentDocument();
  const taskId = await createTaskWhileLocked();
  await beginRequest("EXPLAIN", "EXPLAIN_CANCEL_RACE", "종료할 생성");
  await waitForReady(taskId);
  const lease = JSON.parse(
    await readFile(join(root, "data/cli-process.json"), "utf8"),
  );
  const expected = {
    documentId: document.id,
    path: document.path,
    taskId,
    content: "종료 직전 원문",
    goal: "종료 시 저장한 작업 목표",
    pid: await invoke("e2e_process_id", {}),
  };
  await writeFile(
    join(root, "shutdown-expected.json"),
    JSON.stringify(expected),
  );
  await $('[data-testid="source-editor"]').click();
  await $('[data-testid="source-editor"]').addValue(expected.content);
  await $(".task-condition-details > summary").click();
  await $(".task-conditions textarea[required]").setValue(expected.goal);
  await requestExitWhileLocked();
  await waitForNormalExit(expected.pid);
  await assertWindowAliveAtExit(expected.pid);
  assert.equal(await readFile(document.path, "utf8"), expected.content);
  assert.equal(processAlive(lease.process.pid), false);
  await assert.rejects(stat(join(root, "data/cli-process.json")), {
    code: "ENOENT",
  });
});

async function createTaskWhileLocked() {
  await $(".task-conditions textarea[required]").setValue("종료 검사");
  const release = await holdDatabase();
  try {
    await $("button=작업 만들기").click();
    const disabled = await browser.execute(() =>
      [
        ...document.querySelectorAll(".task-conditions > label > textarea"),
      ].every((field) => field.disabled),
    );
    assert.equal(disabled, true, "작업 생성 저장 중 입력을 잠가야 합니다.");
  } finally {
    await release();
  }
  await browser.waitUntil(
    async () => (await $(".task-picker select").getValue()) !== "",
  );
  return $(".task-picker select").getValue();
}

async function requestExitWhileLocked() {
  const release = await holdDatabase();
  try {
    await invoke("e2e_request_native_exit", {});
    await browser.waitUntil(
      async () =>
        browser.execute(() =>
          [".workspace-body", ".sidebar", ".app-header"].every(
            (selector) => document.querySelector(selector).inert,
          ),
        ),
      { timeoutMsg: "종료 저장 중 새 입력을 잠가야 합니다." },
    );
    await invoke("e2e_request_native_exit", {});
    await browser.execute(() =>
      window.__TAURI__.window.getCurrentWindow().close(),
    );
  } finally {
    await release();
  }
}

async function prepareWritableDocument() {
  await chmod(join(root, "readonly.md"), 0o644);
  await $("button=저장 다시 시도").click();
  await browser.waitUntil(
    async () =>
      (await $('[data-testid="save-status"]').getText()) === "원문 저장됨",
  );
  await $("button=새 문서").click();
  await browser.waitUntil(
    async () => (await $(".document-toolbar h1").getText()) === "새 문서",
  );
}

async function waitForReady(taskId) {
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
}

function processAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (error.code === "ESRCH") return false;
    throw error;
  }
}
