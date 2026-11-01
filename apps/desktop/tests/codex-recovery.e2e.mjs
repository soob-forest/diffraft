import assert from "node:assert/strict";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { captureLayouts } from "./support/codex-settings-review.mjs";
import { settings } from "./support/codex-state.mjs";
import {
  beginRequest,
  createTask,
  terminal,
} from "./support/generation-fixture.mjs";
import { editor, invoke, root } from "./support/review-fixture.mjs";

const diagnostic = join(
  root,
  "data/codex-work/00000000-0000-4000-8000-000000000099",
);
describe("Codex 연결·모델 복구", () => {
  afterEach(async function () {
    if (this.currentTest.state !== "failed") return;
    await mkdir(".artifacts/codex", { recursive: true });
    await browser.saveScreenshot(".artifacts/codex/recovery-failure.png");
  });
  for (const model of [
    { provider: "codex", model: "retired-fixture", effort: "low" },
  ]) {
    it(`${model.model}/${model.effort} 선택을 보존하며 사용 가능한 모델로 변경한다`, () =>
      recoverModel(model));
  }
  it(
    "같은 모델의 미지원 추론 수준을 저장 후 기본값으로 복구한다",
    recoverSameModel,
  );
  it(
    "모델 기본값과 다른 지원되는 저장 추론 수준은 유지한다",
    preserveSupportedEffort,
  );
  it(
    "세션 유실 후 로컬 대화를 보존하고 수동 재시도로 새 연결을 시작한다",
    recoverThread,
  );
});

async function recoverModel(model) {
  const original = await settings({ kind: "read" });
  await settings({ kind: "model", model });
  await rm(join(diagnostic, "codex-generation-ready"), { force: true });
  await $("button=AI 연결 설정").click();
  try {
    await inspect();
    const options = await browser.execute(() =>
      Array.from(document.querySelectorAll("#codex-model option")).map(
        (option) => option.value,
      ),
    );
    assert(
      options.includes("fixture-alt"),
      "available model listing must survive an unavailable saved selection",
    );
    assert.deepEqual((await settings({ kind: "read" })).codexModel, model);
    await assert.rejects(readFile(join(diagnostic, "codex-generation-ready")), {
      code: "ENOENT",
    });
    await $("button=연결 테스트").click();
    await $(".connection-dialog [role=alert]").waitForDisplayed();
    assert.match(
      await $(".connection-dialog [role=alert]").getText(),
      /모델.*선택.*저장/,
    );
    await assert.rejects(readFile(join(diagnostic, "codex-generation-ready")), {
      code: "ENOENT",
    });
    await assertUnusableRequestChoice();
    await chooseModel("fixture-alt");
    await inspect();
    await $("button=연결 테스트").click();
    await browser.waitUntil(async () =>
      (await $('[data-testid="connection-status"]').getText()).includes(
        "연결 테스트 완료",
      ),
    );
    assert.equal(
      (await settings({ kind: "read" })).codexModel.model,
      "fixture-alt",
    );
  } finally {
    await $("button=설정 닫기").waitForEnabled();
    await $("button=설정 닫기").click();
    await settings({ kind: "model", model: original.codexModel });
  }
}

async function assertUnusableRequestChoice() {
  const result = await browser.execute(async (operationId) => {
    try {
      await window.__TAURI__.core.invoke("resolve_request_model", {
        request: { schemaVersion: 1 },
        operationId,
      });
      return { code: "UNEXPECTED_SUCCESS" };
    } catch (reason) {
      return { code: reason.code };
    }
  }, crypto.randomUUID());
  assert.equal(result.code, "CLI_UNSUPPORTED");
}

async function inspect() {
  await $("button=상태·모델 목록 조회").waitForEnabled();
  await $("button=상태·모델 목록 조회").click();
  await $("#codex-model").waitForEnabled();
}

async function recoverSameModel() {
  const original = await settings({ kind: "read" });
  const model = { provider: "codex", model: "fixture-codex", effort: "ultra" };
  await settings({ kind: "model", model });
  await $("button=AI 연결 설정").click();
  try {
    await inspect();
    assert(
      await $("button=모델 설정 저장").isEnabled(),
      "same model reasoning repair must be saveable",
    );
    assert.equal(await $("#codex-model").getValue(), model.model);
    assert.deepEqual((await settings({ kind: "read" })).codexModel, model);
    assert(!(await $("button=연결 테스트").isEnabled()));
    assert.match(await $(".model-settings").getText(), /기본값.*low/);
    await assertUnusableRequestChoice();
    await mkdir(".artifacts/codex", { recursive: true });
    await captureLayouts(
      "reasoning-repair",
      ".connection-dialog",
      '[aria-describedby="codex-effort-repair"]',
    );
    await browser.execute(() =>
      document
        .querySelector('[aria-describedby="codex-effort-repair"]')
        .focus(),
    );
    assert.equal(
      await browser.execute(() =>
        document.activeElement.getAttribute("aria-describedby"),
      ),
      "codex-effort-repair",
    );
    await $("button=모델 설정 저장").click();
    await $("button=상태·모델 목록 조회").waitForEnabled();
    assert.deepEqual((await settings({ kind: "read" })).codexModel, {
      ...model,
      effort: "low",
    });
    await inspect();
    await $("button=연결 테스트").click();
    await browser.waitUntil(async () =>
      (await $('[data-testid="connection-status"]').getText()).includes(
        "연결 테스트 완료",
      ),
    );
  } finally {
    await $("button=설정 닫기").waitForEnabled();
    await $("button=설정 닫기").click();
    await settings({ kind: "model", model: original.codexModel });
  }
}

async function preserveSupportedEffort() {
  const original = await settings({ kind: "read" });
  const model = { provider: "codex", model: "fixture-codex", effort: "medium" };
  await settings({ kind: "model", model });
  await $("button=AI 연결 설정").click();
  try {
    await inspect();
    assert(!(await $("button=모델 설정 저장").isEnabled()));
    assert.deepEqual((await settings({ kind: "read" })).codexModel, model);
    await $("button=연결 테스트").click();
    await browser.waitUntil(async () =>
      (await $('[data-testid="connection-status"]').getText()).includes(
        "연결 테스트 완료",
      ),
    );
    const observed = JSON.parse(
      await readFile(join(diagnostic, "codex-observation.json"), "utf8"),
    );
    assert.equal(observed.effort, "medium");
  } finally {
    await $("button=설정 닫기").waitForEnabled();
    await $("button=설정 닫기").click();
    await settings({ kind: "model", model: original.codexModel });
  }
}

async function chooseModel(model) {
  await browser.execute((value) => {
    const select = document.querySelector("#codex-model");
    select.value = value;
    select.dispatchEvent(new Event("change", { bubbles: true }));
  }, model);
  await $("button=모델 설정 저장").click();
  await $("button=상태·모델 목록 조회").waitForEnabled();
}

async function recoverThread() {
  await $("button=새 문서").click();
  await $(".source-editor .cm-content").waitForExist();
  const document = await selectedDocument();
  const task = await createTask("Codex 유실 연결 복구 검증");
  await beginRequest("EXPLAIN", "CODEX_SUCCESS", "로컬에 보존할 첫 설명");
  const first = await terminal(task);
  assert.equal(first.lastAttempt.status, "SUCCEEDED");
  const observation = join(
    root,
    "data/codex-work",
    task,
    "codex-observation.json",
  );
  const previous = JSON.parse(await readFile(observation, "utf8"));
  await beginRequest(
    "EXPLAIN",
    "CODEX_SESSION_MISSING",
    "유실 이후 복구할 설명",
  );
  const failed = await terminal(task, first.lastAttempt.jobId);
  assert.equal(failed.lastAttempt.errorCode, "SESSION_MISSING");
  assert.equal(failed.session, "MISSING");
  assert.equal(failed.messages.length, 3);
  await browser.waitUntil(async () =>
    (await $(".session-state").getText()).includes("새 대화를 시작"),
  );
  const recovered = await retryThread(task, failed.lastAttempt.jobId);
  assert.equal(recovered.lastAttempt.status, "SUCCEEDED");
  assert.equal(recovered.session, "CONNECTED");
  assert.equal(recovered.messages.length, 5);
  assert.deepEqual(
    recovered.lastAttempt.request.value.model,
    failed.lastAttempt.request.value.model,
  );
  const next = JSON.parse(await readFile(observation, "utf8"));
  assert.notEqual(next.thread, previous.thread);
  assert.equal(await readFile(document.path, "utf8"), "");
}

async function retryThread(task, previousJob) {
  await writeFile(join(root, "next-generation"), "CODEX_RECOVERY_SUCCESS");
  await $("button=마지막 요청 다시 실행").waitForEnabled();
  await $("button=마지막 요청 다시 실행").click();
  return terminal(task, previousJob);
}

async function selectedDocument() {
  const workspace = await invoke("get_workspace_snapshot", {
    request: { schemaVersion: 1 },
  });
  assert(workspace.selectedDocumentId);
  return (
    await editor({ kind: "read", documentId: workspace.selectedDocumentId })
  ).document;
}
