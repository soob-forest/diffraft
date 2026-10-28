import { writeFile } from "node:fs/promises";

export async function measureClick(label, selector, expectedText) {
  await browser.execute(
    (selector, expectedText) => {
      window.uiTiming = { started: null, elapsedMs: null };
      document.addEventListener(
        "click",
        () => {
          window.uiTiming.started = performance.now();
        },
        { capture: true, once: true },
      );
      const observer = new MutationObserver(() => {
        if (
          window.uiTiming.started === null ||
          document.querySelector(selector)?.textContent !== expectedText
        )
          return;
        observer.disconnect();
        requestAnimationFrame(() =>
          requestAnimationFrame(() => {
            window.uiTiming.elapsedMs =
              performance.now() - window.uiTiming.started;
          }),
        );
      });
      observer.observe(document.body, {
        childList: true,
        subtree: true,
        characterData: true,
      });
    },
    selector,
    expectedText,
  );
  await $(`button=${label}`).click();
  await browser.waitUntil(async () =>
    browser.execute(() => window.uiTiming.elapsedMs !== null),
  );
  return browser.execute(() => window.uiTiming.elapsedMs);
}

export async function writePerformance(result) {
  await writeFile(
    ".artifacts/review-performance.json",
    JSON.stringify(
      {
        ...result,
        build: "debug",
        platform: process.platform,
        arch: process.arch,
        method:
          "DOM click capture to matching UI plus two animation frames; real IPC/storage, fake CLI setup",
      },
      null,
      2,
    ),
  );
}
