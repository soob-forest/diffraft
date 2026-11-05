import assert from "node:assert/strict";

export const followupDecisionError = "변경 승인 저장 실패 · 합성 재시도 검사";

export async function installFollowupDecisionFailure(batchId) {
  assert.equal(typeof batchId, "string");
  assert(batchId.length > 0);
  await browser.execute(
    (id, message) => {
      if (globalThis.__reviewFollowupTransport)
        throw new Error("승인 오류 관측기가 이미 설치됐습니다.");
      const internals = globalThis.__TAURI_INTERNALS__;
      if (typeof internals?.convertFileSrc !== "function")
        throw new Error("Tauri IPC fetch 경계가 필요합니다.");
      globalThis.__reviewFollowupTransport = {
        batchId: id,
        message,
        url: internals.convertFileSrc("review_command", "ipc"),
        originalFetch: globalThis.fetch,
        descriptor: Object.getOwnPropertyDescriptor(globalThis, "fetch"),
        calls: 0,
        installed: false,
      };
    },
    batchId,
    followupDecisionError,
  );
  try {
    await configureFollowupMatcher();
    await attachFollowupDecisionFailure();
  } catch (error) {
    await restoreFollowupDecisionFailure();
    throw error;
  }
}

async function configureFollowupMatcher() {
  await browser.execute(() => {
    const state = globalThis.__reviewFollowupTransport;
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
          action?.kind === "accept" &&
          action.decision?.batchId === state.batchId
        );
      } catch (error) {
        if (error instanceof SyntaxError) return false;
        throw error;
      }
    };
  });
}

async function attachFollowupDecisionFailure() {
  await browser.execute(() => {
    const state = globalThis.__reviewFollowupTransport;
    state.wrapper = (input, options) => {
      if (!state.matches(input, options))
        return state.originalFetch.call(globalThis, input, options);
      state.calls++;
      return Promise.resolve(
        new Response(JSON.stringify({ message: state.message }), {
          headers: {
            "Content-Type": "application/json",
            "Tauri-Response": "error",
          },
        }),
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
      throw new Error("승인 오류 관측기 설치 실패");
  });
}

export async function followupDecisionFailureCalls() {
  return browser.execute(
    () => globalThis.__reviewFollowupTransport?.calls ?? 0,
  );
}

export async function restoreFollowupDecisionFailure() {
  await browser.execute(() => {
    const state = globalThis.__reviewFollowupTransport;
    if (!state) return;
    if (state.installed) {
      if (state.descriptor)
        Object.defineProperty(globalThis, "fetch", state.descriptor);
      else delete globalThis.fetch;
    }
    const restored = globalThis.fetch === state.originalFetch;
    delete globalThis.__reviewFollowupTransport;
    if (!restored) throw new Error("승인 오류 관측기 fetch 복원 실패");
  });
  assert.equal(
    await browser.execute(() => !!globalThis.__reviewFollowupTransport),
    false,
  );
}
