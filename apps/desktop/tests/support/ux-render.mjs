import { settleUnitDisplay } from "./unit-review-display.mjs";

const RENDER_TIMEOUT_MS = 1000;

export async function settleUxRender() {
  if (
    [
      "ux-local",
      "review",
      "patch-groups",
      "patch-groups-restart",
      "usability",
    ].includes(process.env.DOCREVIEW_E2E_PHASE)
  )
    return settleUnitDisplay();
  await browser.execute(
    (timeout) =>
      new Promise((resolve, reject) => {
        let first, second;
        const fail = (phase) => {
          cancelAnimationFrame(first);
          cancelAnimationFrame(second);
          reject(
            new Error(
              `UX 화면 대기 실패: ${JSON.stringify({
                phase,
                visibility: document.visibilityState,
                focused: document.hasFocus(),
                viewport: [innerWidth, innerHeight],
              })}`,
            ),
          );
        };
        const timer = setTimeout(() => fail("two-frames-timeout"), timeout);
        first = requestAnimationFrame(() => {
          if (document.visibilityState !== "visible") {
            clearTimeout(timer);
            fail("hidden-before-render");
            return;
          }
          second = requestAnimationFrame(() => {
            clearTimeout(timer);
            if (document.visibilityState !== "visible")
              fail("hidden-after-render");
            else resolve(null);
          });
        });
      }),
    RENDER_TIMEOUT_MS,
  );
}

export async function waitForDiffSelection(side) {
  await browser.waitUntil(
    () =>
      browser.execute((value) => {
        const editor = document.querySelector(`[data-testid="diff-${value}"]`);
        const selection = window.getSelection();
        return (
          editor === document.activeElement &&
          selection &&
          !selection.isCollapsed &&
          editor.contains(selection.anchorNode) &&
          editor.contains(selection.focusNode)
        );
      }, side),
    { timeoutMsg: "비교 편집기 안에서 실제 선택이 확정되어야 합니다." },
  );
  await settleUxRender();
}
