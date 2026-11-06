import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { assertButtonHit } from "./ux-ui.mjs";

export async function checkDraftRecoveryLayouts(
  directory = ".artifacts/ux-followup",
) {
  await mkdir(directory, { recursive: true });
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
        measurements.push({
          actualWindow,
          ...(await inspect(width, height, scale, directory)),
        });
      }
    }
    await writeFile(
      `${directory}/recovery-layout.json`,
      JSON.stringify(measurements, null, 2),
    );
  } finally {
    await zoom(1);
    await browser.setWindowSize(1440, 900);
  }
}
async function inspect(width, height, scale, directory) {
  await assertButtonHit("footer .draft-recovery button");
  const result = await browser.execute(() => {
    const footer = document.querySelector("footer"),
      button = footer.querySelector(".draft-recovery button"),
      rect = button.getBoundingClientRect();
    return {
      viewport: [innerWidth, innerHeight],
      buttonTop: rect.top,
      buttonBottom: rect.bottom,
      overflow: document.documentElement.scrollWidth > innerWidth + 2,
      footerOverflow: footer.scrollWidth > footer.clientWidth + 2,
    };
  });
  assert.equal(result.overflow || result.footerOverflow, false);
  assert.ok(
    result.buttonTop >= 0 && result.buttonBottom <= result.viewport[1] + 1,
    JSON.stringify(result),
  );
  await browser.saveScreenshot(`${directory}/recovery-${width}-${scale}.png`);
  return { width, height, scale, ...result };
}
async function zoom(scale) {
  await browser.execute(
    (value) => window.__TAURI__.webview.getCurrentWebview().setZoom(value),
    scale,
  );
}
