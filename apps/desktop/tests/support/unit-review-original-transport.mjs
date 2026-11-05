import assert from "node:assert/strict";

export const syntheticOriginalError =
  "원래 후보 읽기 실패 · 합성 transport 검사";

export async function installOriginalTransport(batchId) {
  assert.equal(typeof batchId, "string");
  assert(batchId.length > 0);
  try {
    await createProtocolState(batchId);
    await configureProtocolMatcher();
    await attachProtocolFetch();
  } catch (error) {
    await restoreOriginalTransport();
    throw error;
  }
}

async function createProtocolState(batchId) {
  await browser.execute((id) => {
    if (globalThis.__unitOriginalTransport)
      throw new Error("원래 후보 관측기가 이미 설치됐습니다.");
    const internals = globalThis.__TAURI_INTERNALS__;
    if (
      typeof internals?.convertFileSrc !== "function" ||
      typeof fetch !== "function"
    )
      throw new Error("Tauri IPC fetch 경계를 찾을 수 없습니다.");
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, "fetch");
    if (descriptor && !descriptor.configurable && !descriptor.writable)
      throw new Error("테스트용 fetch IPC 경계가 읽기 전용입니다.");
    globalThis.__unitOriginalTransport = {
      batchId: id,
      url: internals.convertFileSrc("review_command", "ipc"),
      originalFetch: globalThis.fetch,
      descriptor,
      calls: 0,
      pending: [],
      installed: false,
    };
  }, batchId);
}

async function configureProtocolMatcher() {
  await browser.execute(() => {
    const state = globalThis.__unitOriginalTransport;
    state.matches = (input, options) => {
      const url =
        typeof input === "string" ? input : (input?.url ?? input?.href);
      if (
        url !== state.url ||
        options?.method !== "POST" ||
        typeof options.body !== "string"
      )
        return false;
      try {
        const action = JSON.parse(options.body)?.request?.action;
        return (
          action?.kind === "original_rewrite" &&
          action.batchId === state.batchId
        );
      } catch (error) {
        if (error instanceof SyntaxError) return false;
        throw error;
      }
    };
  });
}

async function attachProtocolFetch() {
  await browser.execute(() => {
    const state = globalThis.__unitOriginalTransport;
    state.wrapper = (input, options) => {
      if (!state.matches(input, options))
        return state.originalFetch.call(globalThis, input, options);
      state.calls++;
      return new Promise((resolve) =>
        state.pending.push({ input, options, resolve }),
      );
    };
    Object.defineProperty(
      globalThis,
      "fetch",
      state.descriptor?.configurable === false
        ? { ...state.descriptor, value: state.wrapper }
        : {
            value: state.wrapper,
            configurable: true,
            writable: true,
            enumerable: state.descriptor?.enumerable ?? true,
          },
    );
    state.installed = true;
    if (globalThis.fetch !== state.wrapper)
      throw new Error("Tauri IPC fetch 관측기를 설치하지 못했습니다.");
  });
}

export async function originalTransportState() {
  return browser.execute(() => {
    const state = globalThis.__unitOriginalTransport;
    return { calls: state?.calls ?? 0, pending: state?.pending.length ?? 0 };
  });
}

export async function waitOriginalRequest(calls) {
  await browser.waitUntil(
    async () => {
      const state = await originalTransportState();
      return state.calls === calls && state.pending === 1;
    },
    { timeoutMsg: "원래 후보의 IPC fetch만 보류되어야 합니다." },
  );
}

export async function releaseOriginalRequest(outcome) {
  assert(["real", "failure"].includes(outcome));
  await browser.execute(
    async (result, message) => {
      const state = globalThis.__unitOriginalTransport;
      const pending = state?.pending.shift();
      if (!pending) throw new Error("보류된 원래 후보 요청이 없습니다.");
      if (result === "failure") {
        pending.resolve(
          new Response(JSON.stringify({ message }), {
            headers: {
              "Content-Type": "application/json",
              "Tauri-Response": "error",
            },
          }),
        );
        return;
      }
      const response = state.originalFetch.call(
        globalThis,
        pending.input,
        pending.options,
      );
      pending.resolve(response);
      await response;
    },
    outcome,
    syntheticOriginalError,
  );
}

export async function restoreOriginalTransport() {
  await browser.execute(() => {
    const state = globalThis.__unitOriginalTransport;
    if (!state) return;
    if (state.installed) {
      if (state.descriptor)
        Object.defineProperty(globalThis, "fetch", state.descriptor);
      else delete globalThis.fetch;
    }
    for (const pending of state.pending)
      pending.resolve(
        new Response(
          JSON.stringify({ message: "합성 원래 후보 관측을 종료했습니다." }),
          {
            headers: {
              "Content-Type": "application/json",
              "Tauri-Response": "error",
            },
          },
        ),
      );
    const restored = globalThis.fetch === state.originalFetch;
    delete globalThis.__unitOriginalTransport;
    if (!restored)
      throw new Error("Tauri IPC fetch 경계를 복원하지 못했습니다.");
  });
  assert.equal(
    await browser.execute(() => !!globalThis.__unitOriginalTransport),
    false,
  );
}
