import { foregroundUnitApplication } from "./unit-review-key-events.mjs";

const displayTimeoutMs = 1000;

export async function foregroundUnitDisplay(zoom) {
  const pid = await browser.execute(async (scale) => {
    const window = globalThis.__TAURI__.window.getCurrentWindow();
    await window.unminimize();
    await window.show();
    await window.setFocus();
    await globalThis.__TAURI__.webview.getCurrentWebview().setZoom(scale);
    return globalThis.__TAURI__.core.invoke("e2e_process_id", {});
  }, zoom);
  const windows = foregroundUnitApplication(pid);
  await browser.waitUntil(
    () => browser.execute(() => document.visibilityState === "visible"),
    {
      timeout: displayTimeoutMs,
      timeoutMsg: `검증한 테스트 앱의 실제 전면 활성화 후에도 WebView가 표시되지 않습니다: ${JSON.stringify(windows)}`,
    },
  );
  return settleUnitDisplay();
}

export async function readUnitDisplayState() {
  return browser.execute(async (timeout) => {
    const state = {
      visibility: document.visibilityState,
      documentFocused: document.hasFocus(),
      width: innerWidth,
      height: innerHeight,
    };
    const window = globalThis.__TAURI__.window.getCurrentWindow();
    let timer;
    try {
      const [nativeVisible, nativeFocused] = await Promise.race([
        Promise.all([window.isVisible(), window.isFocused()]),
        new Promise((_, reject) => {
          timer = setTimeout(
            () =>
              reject(
                new Error(
                  `측정 native 표시 상태 조회가 멈췄습니다: ${JSON.stringify(state)}`,
                ),
              ),
            timeout,
          );
        }),
      ]);
      return { ...state, nativeVisible, nativeFocused };
    } finally {
      clearTimeout(timer);
    }
  }, displayTimeoutMs);
}

export async function settleUnitDisplay() {
  let before = await readUnitDisplayState();
  if (before.visibility !== "visible" || !before.nativeVisible) {
    await restoreUnitDisplay();
    before = await readUnitDisplayState();
  }
  assertUnitDisplay(before, "before-frames");
  await waitDisplayFrames();
  const state = await readUnitDisplayState();
  assertUnitDisplay(state, "after-frames");
  return state;
}

async function restoreUnitDisplay() {
  const pid = await browser.execute(async () => {
    const window = globalThis.__TAURI__.window.getCurrentWindow();
    await window.unminimize();
    await window.show();
    await window.setFocus();
    return globalThis.__TAURI__.core.invoke("e2e_process_id", {});
  });
  const windows = foregroundUnitApplication(pid);
  await browser.waitUntil(
    async () => {
      const state = await readUnitDisplayState();
      return state.visibility === "visible" && state.nativeVisible;
    },
    {
      timeout: displayTimeoutMs,
      timeoutMsg: `가려진 테스트 창의 표시를 복원할 수 없습니다: ${JSON.stringify(windows)}`,
    },
  );
}

function assertUnitDisplay(state, phase) {
  if (state.visibility !== "visible" || !state.nativeVisible)
    throw new Error(
      `측정 표시 전제가 충족되지 않았습니다: ${JSON.stringify({ phase, ...state })}`,
    );
}

async function waitDisplayFrames() {
  await browser.execute(
    (timeout) =>
      new Promise((resolve, reject) => {
        let first, second;
        const stop = (phase) => {
          cancelAnimationFrame(first);
          cancelAnimationFrame(second);
          reject(
            new Error(
              `측정 프레임 대기가 멈췄습니다: ${JSON.stringify({
                phase,
                visibility: document.visibilityState,
                documentFocused: document.hasFocus(),
                width: innerWidth,
                height: innerHeight,
              })}`,
            ),
          );
        };
        const timer = setTimeout(() => stop("two-raf-timeout"), timeout);
        first = requestAnimationFrame(() => {
          if (document.visibilityState !== "visible") {
            clearTimeout(timer);
            stop("hidden-after-first-frame");
            return;
          }
          second = requestAnimationFrame(() => {
            clearTimeout(timer);
            resolve(null);
          });
        });
      }),
    displayTimeoutMs,
  );
}
