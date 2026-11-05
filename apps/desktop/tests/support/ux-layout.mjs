import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { foregroundUnitDisplay } from "./unit-review-display.mjs";
import { settleUxRender } from "./ux-render.mjs";
import { assertButtonHit } from "./ux-ui.mjs";

export async function checkSelectedLayouts(instruction, name = "selected") {
  const measurements = [];
  try {
    for (const [width, height] of [
      [1440, 900],
      [1280, 800],
      [800, 600],
    ]) {
      await zoom(1);
      await resizeWindow(width, height);
      for (const scale of [1, 1.5, 2])
        measurements.push(
          await inspect({ width, height, scale, instruction, name }),
        );
    }
    await writeFile(
      `.artifacts/ux/${name}-layout.json`,
      JSON.stringify(measurements, null, 2),
    );
  } finally {
    await zoom(1);
    await resizeWindow(1440, 900);
  }
}
async function inspect({ width, height, scale, instruction, name }) {
  await zoom(scale);
  assert.equal(
    await $(".selected-request-form textarea").getValue(),
    instruction,
  );
  await assertButtonHit(".selected-request-form button[type=submit]");
  if (name === "error") {
    const error = $(".selected-request-form > p[role=status]");
    assert.match(await error.getText(), /범위가 맞지/);
    await browser.execute(() =>
      document
        .querySelector(".selected-request-form > p[role=status]")
        .scrollIntoView({ block: "center", behavior: "instant" }),
    );
    await settleUxRender();
    assert.equal(await error.isDisplayed(), true);
  }
  const result = await readLayoutMeasurements();
  assert.equal(
    result.overflow || result.panelOverflow,
    false,
    JSON.stringify({ width, height, scale, result }),
  );
  assert.equal(result.font, "16px");
  assert.equal(result.popovers, 0);
  assert.ok(
    result.quoteHeight <= result.lineHeight * 4 + 2,
    JSON.stringify(result),
  );
  await browser.saveScreenshot(`.artifacts/ux/${name}-${width}-${scale}.png`);
  const actual = await browser.getWindowSize();
  return {
    window: [width, height],
    windowBasis: "outer",
    actualWindow: [actual.width, actual.height],
    scale,
    ...result,
  };
}
async function readLayoutMeasurements() {
  return browser.execute(() => {
    const panel = document.querySelector(".workspace-panel"),
      form = document.querySelector(".selected-request-form"),
      quote = form.querySelector(".quote-text"),
      style = getComputedStyle(quote);
    return {
      viewport: [innerWidth, innerHeight],
      overflow: document.documentElement.scrollWidth > innerWidth + 2,
      panelOverflow: panel.scrollWidth > panel.clientWidth + 2,
      quoteHeight: quote.clientHeight,
      lineHeight: parseFloat(style.lineHeight),
      font: style.fontSize,
      popovers: document.querySelectorAll(".selection-context").length,
    };
  });
}
async function resizeWindow(width, height) {
  await browser.setWindowSize(width, height);
  if (process.env.DOCREVIEW_E2E_PHASE === "ux-local")
    await foregroundUnitDisplay(1);
  else await settleUxRender();
  if (
    width > 1000 &&
    (await $("button=문서 목록").isExisting()) &&
    (await $("button=문서 목록").getAttribute("aria-expanded")) === "false"
  )
    await $("button=문서 목록").click();
}
async function zoom(scale) {
  await browser.execute(
    (scale) => window.__TAURI__.webview.getCurrentWebview().setZoom(scale),
    scale,
  );
  await settleUxRender();
}
