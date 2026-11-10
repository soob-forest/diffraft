import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { chooseRequestMode, showTaskPanel } from "./generation-fixture.mjs";
import {
  foregroundUnitDisplay,
  settleUnitDisplay,
} from "./unit-review-display.mjs";
import { assertButtonHit } from "./ux-ui.mjs";

export async function checkResponsiveWorkspace() {
  const draft = await $(".request-form textarea").getValue();
  const measurements = [];
  try {
    for (const [width, height] of [
      [800, 600],
      [1280, 800],
      [1440, 900],
    ]) {
      await zoom(1);
      await browser.setWindowSize(width, height);
      for (const scale of [1, 1.5, 2])
        measurements.push(
          await inspectEnvironment({ width, height, scale, draft }),
        );
    }
    await finishMeasurements(measurements);
  } finally {
    await zoom(1);
    await browser.setWindowSize(1440, 900);
  }
}

async function inspectEnvironment({ width, height, scale, draft }) {
  await zoom(scale);
  const back = $("button=본문으로 돌아가기"),
    close = $("button=요청·상세 접기");
  if (await back.isDisplayed()) await back.click();
  else if (await close.isDisplayed()) await close.click();
  await settleUnitDisplay();
  await $("button=선택한 변경 승인").scrollIntoView({ block: "center" });
  await assertButtonHit(".selected-group .proposal-actions .primary");
  const measure = await browser.execute(() => ({
    width: innerWidth,
    height: innerHeight,
    overflow: document.documentElement.scrollWidth > innerWidth + 2,
    workspaceOverflow:
      document.querySelector(".workspace-body").scrollWidth >
      document.querySelector(".workspace-body").clientWidth + 2,
  }));
  assert.equal(
    measure.overflow || measure.workspaceOverflow,
    false,
    JSON.stringify({ width, height, scale, measure }),
  );
  await $(".diff-pane").scrollIntoView({ block: "center" });
  const readable = await inspectReadable();
  assert.ok(
    readable.mainHeight >= readable.height &&
      readable.reviewHeight >= readable.height &&
      readable.height >= 120 &&
      readable.hit &&
      readable.historySeparated,
    JSON.stringify({ width, height, scale, readable }),
  );
  await browser.saveScreenshot(
    `.artifacts/usability/review-${width}-${scale}.png`,
  );
  await assertHistoryReachable();
  await inspectRequest({ width, scale, draft });
  return {
    requestedWindow: [width, height],
    actualWindow: await browser.getWindowSize(),
    zoom: scale,
    ...measure,
    readable,
  };
}

async function inspectRequest({ width, scale, draft }) {
  await showTaskPanel();
  await $(".request-form textarea").scrollIntoView({ block: "center" });
  assert.equal(await $(".request-form textarea").getValue(), draft);
  await $("button=요청 내용 확인").scrollIntoView({ block: "center" });
  await assertButtonHit(".request-form button[type=submit]");
  await browser.saveScreenshot(
    `.artifacts/usability/request-${width}-${scale}.png`,
  );
}

async function inspectReadable() {
  return browser.execute(() => {
    const pane = document.querySelector(".diff-pane"),
      bounds = pane.getBoundingClientRect();
    const history = document
      .querySelector(".document-history")
      .getBoundingClientRect();
    const x = Math.max(
      1,
      Math.min(innerWidth - 1, bounds.x + bounds.width / 2),
    );
    const y = Math.max(
      1,
      Math.min(innerHeight - 1, bounds.y + bounds.height / 2),
    );
    return {
      gridRows: getComputedStyle(document.querySelector(".document-workspace"))
        .gridTemplateRows,
      mainHeight: document
        .querySelector(".document-main")
        .getBoundingClientRect().height,
      reviewHeight: document
        .querySelector(".review-panel")
        .getBoundingClientRect().height,
      historySeparated: history.top >= bounds.bottom - 1,
      history: history.top,
      bottom: bounds.bottom,
      height: bounds.height,
      hit: pane.contains(document.elementFromPoint(x, y)),
    };
  });
}

async function finishMeasurements(measurements) {
  await zoom(1);
  await browser.setWindowSize(1440, 900);
  await checkRewriteEntry();
  await writeFile(
    ".artifacts/usability/measurements.json",
    JSON.stringify(measurements, null, 2),
  );
}

async function checkRewriteEntry() {
  await browser.setWindowSize(800, 600);
  await showTaskPanel();
  await chooseRequestMode("REWRITE");
  assert.equal(await $('select[aria-label="수정 방식"]').getValue(), "REWRITE");
  await $(".request-form textarea").click();
  await browser.waitUntil(async () =>
    browser.execute(() =>
      document.activeElement?.matches(".request-form textarea"),
    ),
  );
  assert.equal(await $(".generation-dialog").isExisting(), false);
  await browser.setWindowSize(1440, 900);
  await showTaskPanel();
  await chooseRequestMode("PATCH");
}

async function zoom(scale) {
  await foregroundUnitDisplay(scale);
}

async function assertHistoryReachable() {
  await $(".version-history > summary").scrollIntoView({ block: "center" });
  const reachable = await browser.execute(() => {
    const summary = document.querySelector(".version-history > summary");
    const rect = summary.getBoundingClientRect();
    return summary.contains(
      document.elementFromPoint(
        rect.x + rect.width / 2,
        rect.y + rect.height / 2,
      ),
    );
  });
  assert.equal(
    reachable,
    true,
    "버전 기록은 비교 뒤 독립적으로 접근해야 합니다",
  );
}
