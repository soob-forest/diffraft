import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { showTaskPanel } from "./generation-fixture.mjs";
import {
  foregroundUnitDisplay as displayState,
  readUnitDisplayState,
} from "./unit-review-display.mjs";
import { assertButtonHit } from "./ux-ui.mjs";

const directory = ".artifacts/request-workflow";
export async function inspectRequestLayouts(state) {
  const previous = await browser.getWindowSize(),
    measurements = [];
  try {
    for (const [width, height] of [
      [1440, 900],
      [1280, 800],
      [800, 600],
    ]) {
      await displayState(1);
      await browser.setWindowSize(width, height);
      for (const zoom of [1, 1.5, 2])
        measurements.push(await inspect({ state, width, height, zoom }));
    }
    await writeFile(
      `${directory}/${state}-layout.json`,
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
    await browser.setWindowSize(previous.width, previous.height);
    await displayState(1);
    await showTaskPanel();
  }
}
async function inspect({ state, width, height, zoom }) {
  await displayState(zoom);
  await showTaskPanel();
  await assertButtonHit(".request-form button[type=submit]");
  const geometry = await requestGeometry();
  assert.equal(
    geometry.overflow || geometry.panelOverflow,
    false,
    JSON.stringify(geometry),
  );
  assert.equal(geometry.font, "16px");
  assert.ok(geometry.target);
  assert.equal(geometry.inputHit, true);
  assert.ok(
    geometry.controls.every((control) => control.hit),
    JSON.stringify(geometry.controls),
  );
  const display = await readUnitDisplayState();
  await browser.saveScreenshot(`${directory}/${state}-${width}-${zoom}.png`);
  return {
    window: [width, height],
    actualWindow: await browser.getWindowSize(),
    zoom,
    ...geometry,
    ...display,
  };
}

async function requestGeometry() {
  return browser.execute(() => {
    const panel = document.querySelector(".workspace-panel"),
      input = document.querySelector(".request-form textarea");
    const form = input.closest("form");
    const target =
      form.querySelector(".question-target strong") ??
      form.querySelector(".scope-summary") ??
      form.querySelector(".scope-bar strong") ??
      form.querySelector("strong");
    input.scrollIntoView({ block: "center", behavior: "instant" });
    const rect = input.getBoundingClientRect();
    const controls = [
      ...document.querySelectorAll(".workspace-panel-navigation button"),
    ]
      .filter((button) => button.getClientRects().length)
      .map((button) => {
        const bounds = button.getBoundingClientRect();
        return {
          label: button.textContent,
          hit: button.contains(
            document.elementFromPoint(
              bounds.x + bounds.width / 2,
              bounds.y + bounds.height / 2,
            ),
          ),
        };
      });
    return {
      viewport: [innerWidth, innerHeight],
      overflow: document.documentElement.scrollWidth > innerWidth + 2,
      panelOverflow: panel.scrollWidth > panel.clientWidth + 2,
      font: getComputedStyle(input).fontSize,
      target: target?.textContent,
      instructionLength: input.value.length,
      inputHit: input.contains(
        document.elementFromPoint(
          rect.x + rect.width / 2,
          rect.y + rect.height / 2,
        ),
      ),
      controls,
    };
  });
}
