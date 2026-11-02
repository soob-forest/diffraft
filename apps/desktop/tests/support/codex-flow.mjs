import assert from "node:assert/strict";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { nativeCancelAndRetry } from "./codex-native-retry.mjs";
import { captureLayouts, settingsReview } from "./codex-settings-review.mjs";
import { saveExpected, settings } from "./codex-state.mjs";
import {
  beginRequest,
  createTask,
  currentDocument,
  terminal,
} from "./generation-fixture.mjs";
import { root } from "./review-fixture.mjs";
import { openRegenerate } from "./review-ui.mjs";
import { decide, requestRewrite, start } from "./rewrite-fixture.mjs";
export function registerCodexFlow(native = false) {
  const fixture = native ? "CODEX_NATIVE" : "CODEX_SUCCESS";
  const state = {};
  describe(
    native ? "현재 ChatGPT 계정으로 앱 실사용" : "Claude 없이 Codex 앱 사용",
    () => {
      afterEach(async function () {
        if (this.currentTest.state !== "failed") return;
        await mkdir(".artifacts/codex", { recursive: true });
        await browser.saveScreenshot(".artifacts/codex/failure.png");
      });
      it("공급자 설정·모델 조회·최소 연결 테스트를 수행한다", () =>
        connection(state, native));
      if (!native)
        it(
          "인증·저장 실패를 보존하고 여섯 화면 조합에서 설정을 조작한다",
          settingsReview,
        );
      it("설명과 부분 수정은 승인 전 원문을 바꾸지 않는다", () =>
        initialGeneration(state, fixture));
      it("재제안·전체 재작성·다른 방향을 생성하고 명시적으로 적용한다", () =>
        revisionAndRewrite(state, fixture));
      if (!native)
        it("진행 중 모델을 표시하고 중단 후 기존 원문·후보를 보존한다", () =>
          cancelTurn(state));
      if (!native)
        it("한도 실패 후 기본 공급자가 달라도 이전 요청으로 재시도한다", () =>
          failureAndRetry(state));
      if (native)
        it("실제 계정 요청을 중단하고 설정 변경 후에도 같은 모델로 재시도한다", () =>
          nativeCancelAndRetry(state));
      it("결과와 선택을 재시작 검증용으로 기록한다", () =>
        saveExpected(state, native));
    },
  );
}

async function connection(state, native) {
  assert.equal((await settings({ kind: "read" })).provider, "codex");
  await $("button=AI 연결 설정").click();
  await $("#codex-model").waitForEnabled();
  assert.equal(await $("#ai-provider").getValue(), "codex");
  await $("button=상태·모델 목록 조회").click();
  await browser.waitUntil(
    async () => await $("button=상태·모델 목록 조회").isEnabled(),
    { timeout: 30000 },
  );
  assert.match(
    await $('[data-testid="connection-status"]').getText(),
    /인증과 모델 목록/,
  );
  if (!native) {
    await browser.execute(() => {
      const select = document.querySelector("#codex-model");
      select.value = "fixture-alt";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await browser.waitUntil(
      async () => !(await $("button=연결 테스트").isEnabled()),
    );
    await $("button=모델 설정 저장").click();
    await $("button=상태·모델 목록 조회").waitForEnabled();
    await $("button=상태·모델 목록 조회").click();
    await $("button=상태·모델 목록 조회").waitForEnabled();
  }
  await $("button=연결 테스트").click();
  await browser.waitUntil(
    async () => {
      const error = await $(".connection-dialog [role=alert]");
      if (await error.isExisting()) assert.fail(await error.getText());
      return (await $('[data-testid="connection-status"]').getText()).includes(
        "연결 테스트 완료",
      );
    },
    { timeout: 120000 },
  );
  state.choice = (await settings({ kind: "read" })).codexModel;
  state.version = await readVersion();
  await mkdir(".artifacts/codex", { recursive: true });
  await browser.saveScreenshot(
    native
      ? ".artifacts/codex/native-connection.png"
      : ".artifacts/codex/connection.png",
  );
  await $("button=설정 닫기").click();
}

async function initialGeneration(state, fixture) {
  await $("button=새 문서").click();
  await $(".source-editor .cm-content").waitForExist();
  state.document = await currentDocument();
  state.task = await createTask("합성 문서의 Codex 연결 검증");
  await $("button=설명").click();
  await $(".request-form textarea").setValue(
    "합성 검증입니다. EXPLAIN으로 짧게 연결 확인을 답해 주세요. 도구를 사용하지 마세요.",
  );
  await $("button=요청 내용 확인").click();
  await $(".generation-dialog").waitForDisplayed();
  assert.match(await $(".generation-dialog .request-model").getText(), /Codex/);
  if (fixture !== "CODEX_NATIVE")
    await captureLayouts(
      "request",
      ".generation-dialog",
      ".generation-dialog .request-model",
    );
  await writeFile(join(root, "next-generation"), fixture);
  await $("button=확인 후 요청").scrollIntoView();
  await $("button=확인 후 요청").click();
  let page = await terminal(
    state.task,
    null,
    fixture === "CODEX_NATIVE" ? 120000 : 10000,
  );
  await assertSuccess(page);
  assert.equal(page.lastAttempt.request.value.model.provider, "codex");
  state.lastJob = page.lastAttempt.jobId;
  await beginRequest(
    "PATCH",
    fixture,
    "빈 문서에 '# 합성 검증\nCodex 연결을 확인했습니다.\n' 초안을 제안해 주세요. PATCH 변경을 최소 하나 포함하고 도구는 사용하지 마세요.",
  );
  page = await terminal(
    state.task,
    state.lastJob,
    fixture === "CODEX_NATIVE" ? 120000 : 10000,
  );
  await assertSuccess(page);
  state.lastJob = page.lastAttempt.jobId;
  assert.equal(await readFile(state.document.path, "utf8"), "");
  await $('[data-testid="diff-stats"]').waitForDisplayed();
}

async function cancelTurn(state) {
  await rm(
    join(root, "data/codex-work", state.task, "codex-generation-ready"),
    { force: true },
  );
  await beginRequest("EXPLAIN", "CODEX_HANG", "중단과 모델 고정을 검증합니다.");
  await browser.waitUntil(async () => {
    try {
      return (
        (await readFile(
          join(root, "data/codex-work", state.task, "codex-generation-ready"),
          "utf8",
        )) === "ready"
      );
    } catch {
      return false;
    }
  });
  assert.match(
    await browser.execute(() =>
      Array.from(document.querySelectorAll(".generation-panel [role=status]"))
        .map((node) => node.textContent)
        .join(" "),
    ),
    /Codex/,
  );
  await $("button=생성 중단").click();
  const page = await terminal(state.task, state.lastJob);
  assert.equal(page.lastAttempt.status, "CANCELLED");
  assert.equal(
    await readFile(
      join(root, "data/codex-work", state.task, "codex-interrupted"),
      "utf8",
    ),
    "interrupted",
  );
  assert.equal(await readFile(state.document.path, "utf8"), state.confirmed);
  state.lastJob = page.lastAttempt.jobId;
}

async function revisionAndRewrite(state, fixture) {
  await openRegenerate();
  await $(".regenerate-form textarea").setValue(
    "같은 원문 범위에서 '현재 계정으로 연결 확인'을 포함하는 다른 후보를 제안해 주세요. 도구를 사용하지 마세요.",
  );
  await $("button=재제안 요청").click();
  await $("button=확인 후 재제안").waitForEnabled();
  await writeFile(join(root, "next-generation"), fixture);
  await $("button=확인 후 재제안").click();
  let page = await terminal(
    state.task,
    state.lastJob,
    fixture === "CODEX_NATIVE" ? 120000 : 10000,
  );
  await assertSuccess(page);
  state.lastJob = page.lastAttempt.jobId;
  await requestRewrite();
  await start(fixture);
  page = await terminal(
    state.task,
    state.lastJob,
    fixture === "CODEX_NATIVE" ? 120000 : 10000,
  );
  await assertSuccess(page);
  state.lastJob = page.lastAttempt.jobId;
  await requestRewrite(true);
  await start(fixture);
  page = await terminal(
    state.task,
    state.lastJob,
    fixture === "CODEX_NATIVE" ? 120000 : 10000,
  );
  await assertSuccess(page);
  state.lastJob = page.lastAttempt.jobId;
  assert.equal(await readFile(state.document.path, "utf8"), "");
  await decide("이 재작성안 적용", "확인 후 전체 적용");
  await browser.waitUntil(
    async () => (await readFile(state.document.path, "utf8")).length > 0,
  );
  state.confirmed = await readFile(state.document.path, "utf8");
}

async function failureAndRetry(state) {
  await beginRequest(
    "EXPLAIN",
    "CODEX_LIMIT",
    "실패와 수동 재시도를 검증합니다.",
  );
  let page = await terminal(state.task, state.lastJob);
  assert.equal(page.lastAttempt.errorCode, "RATE_OR_POLICY");
  state.lastJob = page.lastAttempt.jobId;
  const previous = page.lastAttempt.request.value.model;
  await settings({ kind: "provider", provider: "claude" });
  await writeFile(join(root, "next-generation"), "CODEX_SUCCESS");
  await $("button=마지막 요청 다시 실행").waitForEnabled();
  await $("button=마지막 요청 다시 실행").click();
  page = await terminal(state.task, state.lastJob);
  await assertSuccess(page);
  assert.deepEqual(page.lastAttempt.request.value.model, previous);
  assert.equal(page.lastAttempt.request.value.retryOf, state.lastJob);
  assert.equal(await readFile(state.document.path, "utf8"), state.confirmed);
  state.lastJob = page.lastAttempt.jobId;
  await settings({ kind: "provider", provider: "codex" });
}

async function assertSuccess(page) {
  if (page.lastAttempt.status !== "SUCCEEDED") {
    const message = await browser.execute(() =>
      Array.from(
        document.querySelectorAll(
          ".generation-panel > [role=status],.regenerate-form > [role=status],.rewrite-form > [role=status]",
        ),
      )
        .map((node) => node.textContent)
        .join(" "),
    );
    assert.fail(`${page.lastAttempt.errorCode}: ${message}`);
  }
}

function readVersion() {
  return browser.execute(
    () =>
      document.querySelector(".connection-diagnostics dd:last-child")
        ?.textContent,
  );
}
