import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import {
  readUnitDisplayState,
  settleUnitDisplay,
} from "./unit-review-display.mjs";
import { assertButtonHit } from "./ux-ui.mjs";

export async function inspectWorkflowState(state, selector, action) {
  const previous = await browser.getWindowSize(),
    measurements = [];
  await mkdir(".artifacts/request-workflow", { recursive: true });
  const close = $("button=요청·상세 접기");
  if ((await close.isExisting()) && (await close.isDisplayed()))
    await close.click();
  try {
    for (const [width, height] of [
      [1440, 900],
      [1280, 800],
      [800, 600],
    ]) {
      await displayState(1);
      await browser.setWindowSize(width, height);
      for (const zoom of [1, 1.5, 2]) {
        await displayState(zoom);
        const geometry = await captureState(selector, action);
        measurements.push({
          window: [width, height],
          zoom,
          ...geometry,
          ...(await readUnitDisplayState()),
        });
        await browser.saveScreenshot(
          `.artifacts/request-workflow/${state}-${width}-${zoom}.png`,
        );
      }
    }
    await writeFile(
      `.artifacts/request-workflow/${state}-layout.json`,
      JSON.stringify(
        {
          build: JSON.parse(
            await readFile(".artifacts/build-e2e.json", "utf8"),
          ),
          measurements,
        },
        null,
        2,
      ),
    );
  } finally {
    await displayState(1);
    await browser.setWindowSize(previous.width, previous.height);
  }
}
export async function displayState(zoom) {
  await browser.execute(async (scale) => {
    const window = globalThis.__TAURI__.window.getCurrentWindow();
    await window.unminimize();
    await window.show();
    await window.setFocus();
    await globalThis.__TAURI__.webview.getCurrentWebview().setZoom(scale);
  }, zoom);
  await settleUnitDisplay();
}
async function captureState(selector, action) {
  await assertButtonHit(action);
  const geometry = await browser.execute((query) => {
    const root = document.querySelector(query);
    root.scrollIntoView({ block: "center", behavior: "instant" });
    const rect = root.getBoundingClientRect();
    return {
      viewport: [innerWidth, innerHeight],
      text: root.textContent,
      overflow: document.documentElement.scrollWidth > innerWidth + 2,
      bounds: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
      visible: root.getClientRects().length > 0,
    };
  }, selector);
  assert.equal(geometry.overflow, false, JSON.stringify(geometry));
  assert.equal(geometry.visible, true);
  assert.ok(geometry.bounds.width > 0 && geometry.bounds.height > 0);
  return geometry;
}
