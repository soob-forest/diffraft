import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { resizeContent } from "./tobe-fixture.mjs";
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
      await resizeContent(width, height);
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
    await resizeContent(1440, 900);
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
    await error.scrollIntoView({ block: "center" });
    assert.equal(await error.isDisplayed(), true);
  }
  const result = await browser.execute(() => {
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
  return { window: [width, height], scale, ...result };
}
async function zoom(scale) {
  await browser.execute(
    (scale) => window.__TAURI__.webview.getCurrentWebview().setZoom(scale),
    scale,
  );
}
