import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";

export async function popupLayouts(select, boundary, name) {
  const measurements = [];
  try {
    for (const [width, height] of [
      [1440, 900],
      [1280, 800],
      [800, 600],
    ]) {
      await zoom(1);
      await browser.setWindowSize(width, height);
      const actualWindow = await browser.getWindowSize();
      const availableHeight = await browser.execute(() => screen.availHeight);
      assert.equal(actualWindow.width, width);
      assert.ok(actualWindow.height >= Math.min(height, availableHeight) - 1);
      assert.ok(actualWindow.height <= height);
      for (const scale of [1, 1.5, 2]) {
        await zoom(scale);
        const toggle = $(".workspace-controls button");
        if ((await toggle.getAttribute("aria-expanded")) === "true")
          await toggle.click();
        await select();
        await $(".selection-context").waitForDisplayed();
        const result = await popupGeometry(boundary);
        assert.ok(
          result.visible &&
            result.hit &&
            result.withinEditor &&
            result.selectionVisible,
          JSON.stringify({ width, height, scale, result }),
        );
        await browser.saveScreenshot(
          `.artifacts/selection-popover/${name}-${width}-${scale}.png`,
        );
        measurements.push({ width, height, actualWindow, scale, ...result });
      }
    }
    await writeFile(
      `.artifacts/selection-popover/${name}-layout.json`,
      JSON.stringify(measurements, null, 2),
    );
  } finally {
    await zoom(1);
    await browser.setWindowSize(1440, 900);
  }
}
async function popupGeometry(boundary) {
  const geometry = await readPopupGeometry(boundary);
  const selectionVisible = await browser.execute((boundary) => {
    const editor = document.querySelector(boundary);
    return [...editor.querySelectorAll(".cm-selectionBackground")].some(
      (element) => {
        const rect = element.getBoundingClientRect();
        return (
          rect.width > 0 &&
          rect.height > 0 &&
          editor.contains(
            document.elementFromPoint(
              rect.x + rect.width / 2,
              rect.y + rect.height / 2,
            ),
          )
        );
      },
    );
  }, boundary);
  return { ...geometry, selectionVisible };
}
async function readPopupGeometry(boundary) {
  return browser.execute((boundary) => {
    const popup = document.querySelector(".selection-context"),
      button = popup.querySelector("button"),
      rect = popup.getBoundingClientRect(),
      action = button.getBoundingClientRect(),
      editor = document.querySelector(boundary).getBoundingClientRect();
    return {
      viewport: [innerWidth, innerHeight],
      rect: rect.toJSON(),
      visible:
        rect.left >= 0 &&
        rect.top >= 0 &&
        rect.right <= innerWidth + 1 &&
        rect.bottom <= innerHeight + 1,
      hit: button.contains(
        document.elementFromPoint(
          action.x + action.width / 2,
          action.y + action.height / 2,
        ),
      ),
      withinEditor: rect.right <= editor.right + 1,
    };
  }, boundary);
}
async function zoom(scale) {
  await browser.execute(
    (scale) => window.__TAURI__.webview.getCurrentWebview().setZoom(scale),
    scale,
  );
}
