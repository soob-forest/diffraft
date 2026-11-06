import assert from "node:assert/strict";
import { foregroundUnitDisplay } from "./unit-review-display.mjs";
import {
  assertReadingLayout,
  locateSelectedUnit,
} from "./unit-review-layout-checks.mjs";
import { captureUnitLayout } from "./unit-review-layout-observation.mjs";

export async function checkShortUnitLayouts() {
  const previous = await browser.getWindowSize();
  const close = $("button=요청·상세 접기");
  if ((await close.isExisting()) && (await close.isDisplayed()))
    await close.click();
  try {
    for (const [width, height] of [
      [1440, 900],
      [1280, 800],
      [800, 600],
    ]) {
      await foregroundUnitDisplay(1);
      await browser.setWindowSize(width, height);
      for (const zoom of [1, 1.5, 2]) {
        await foregroundUnitDisplay(zoom);
        await locateSelectedUnit();
        const observed = await captureUnitLayout(`short-${width}-${zoom}`, {
          state: "short-review",
          width,
          height,
          zoom,
          phase: "explicit-target-location",
        });
        assertReadingLayout(observed);
        for (const kind of ["delete", "insert"])
          assert.ok(
            observed.selection.rows.some(
              (row) => row.kind === kind && row.fullyReadable,
            ),
            `${width}/${zoom}: ${kind} must be fully readable with decisions`,
          );
      }
    }
  } finally {
    await foregroundUnitDisplay(1);
    await browser.setWindowSize(previous.width, previous.height);
  }
}
