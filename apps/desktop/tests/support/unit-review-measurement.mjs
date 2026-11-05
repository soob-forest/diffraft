import { mkdir, readFile, writeFile } from "node:fs/promises";
import { foregroundUnitDisplay } from "./unit-review-display.mjs";

export async function measureUnitReviewAfter() {
  const previous = await browser.getWindowSize();
  try {
    await browser.setWindowSize(1280, 800);
    const display = await foregroundUnitDisplay(1);
    const geometry = await readGeometry();
    const build = JSON.parse(
      await readFile(".artifacts/build-e2e.json", "utf8"),
    );
    await mkdir(".artifacts/unit-review/after", { recursive: true });
    await writeFile(
      ".artifacts/unit-review/after/initial-layout-1280-1.json",
      JSON.stringify({ ...geometry, display, build }, null, 2),
    );
    await browser.saveScreenshot(
      ".artifacts/unit-review/after/initial-layout-1280-1.png",
    );
  } finally {
    await browser.setWindowSize(previous.width, previous.height);
    await foregroundUnitDisplay(1);
  }
}

async function readGeometry() {
  return browser.execute(() => {
    const selectors = [
      ".document-toolbar",
      ".document-modebar",
      ".unit-review-tools",
      ".unit-core",
      ".unit-progress",
      ".unit-feedback",
      ".unit-comparison-label",
      ".unit-diff-body:not([hidden])",
      ".unit-diff-body:not([hidden]) .diff-panes",
      ".unit-diff-body:not([hidden]) .cm-scroller",
    ];
    return {
      viewport: {
        width: innerWidth,
        height: innerHeight,
        dpr: devicePixelRatio,
      },
      zoom: 1,
      phase: "initial-before-test-scroll",
      workspaceScrollTop: document.querySelector(".document-workspace")
        ?.scrollTop,
      rects: Object.fromEntries(
        selectors.map((selector) => {
          const rect = document
            .querySelector(selector)
            ?.getBoundingClientRect();
          return [
            selector,
            rect
              ? {
                  x: rect.x,
                  y: rect.y,
                  width: rect.width,
                  height: rect.height,
                  bottom: rect.bottom,
                }
              : null,
          ];
        }),
      ),
    };
  });
}
