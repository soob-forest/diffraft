import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { showTaskPanel } from "./generation-fixture.mjs";
import { resizeContent } from "./tobe-fixture.mjs";

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
      await resizeContent(width, height);
      for (const scale of [1, 1.5, 2])
        measurements.push(
          await inspectEnvironment({ width, height, scale, draft }),
        );
    }
    await finishMeasurements(measurements);
  } finally {
    await zoom(1);
    await resizeContent(1440, 900);
  }
}

async function inspectEnvironment({ width, height, scale, draft }) {
  await zoom(scale);
  if (await $("button=작업 패널 접기").isExisting())
    await $("button=작업 패널 접기").click();
  await $("button=선택한 변경 승인").scrollIntoView({ block: "center" });
  await assertReachable("선택한 변경 승인");
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
    readable.height >= 120 && readable.hit && readable.historySeparated,
    JSON.stringify({ width, height, scale, readable }),
  );
  await browser.saveScreenshot(
    `.artifacts/usability/review-${width}-${scale}.png`,
  );
  await assertHistoryReachable();
  await showTaskPanel();
  await $(".request-form textarea").scrollIntoView({ block: "center" });
  assert.equal(await $(".request-form textarea").getValue(), draft);
  await $("button=요청 내용 확인").scrollIntoView({ block: "center" });
  await assertReachable("요청 내용 확인");
  await browser.saveScreenshot(
    `.artifacts/usability/request-${width}-${scale}.png`,
  );
  return { window: [width, height], zoom: scale, ...measure, readable };
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
  await resizeContent(1440, 900);
  await checkRewriteEntry();
  await writeFile(
    ".artifacts/usability/measurements.json",
    JSON.stringify(measurements, null, 2),
  );
}

async function checkRewriteEntry() {
  await resizeContent(800, 600);
  await showTaskPanel();
  if ((await $(".request-extras").getAttribute("open")) === null)
    await $(".request-extras > summary").click();
  await $("button=전체 재작성으로 이동").scrollIntoView();
  await $("button=전체 재작성으로 이동").click();
  await $(".rewrite-form textarea").waitForDisplayed();
  await browser.waitUntil(async () =>
    browser.execute(() =>
      document.activeElement?.matches(".rewrite-form textarea"),
    ),
  );
  assert.equal(await $(".rewrite-dialog").isExisting(), false);
  await resizeContent(1440, 900);
  await showTaskPanel();
}

async function zoom(scale) {
  await browser.execute(
    (scale) => window.__TAURI__.webview.getCurrentWebview().setZoom(scale),
    scale,
  );
}

async function assertReachable(label) {
  const result = await browser.execute((label) => {
    const button = [...document.querySelectorAll("button")].find(
      (element) =>
        element.textContent.trim() === label && element.getClientRects().length,
    );
    const rect = button.getBoundingClientRect(),
      x = rect.x + rect.width / 2,
      y = rect.y + rect.height / 2;
    return {
      label,
      x,
      y,
      hit: button.contains(document.elementFromPoint(x, y)),
      viewport: [innerWidth, innerHeight],
    };
  }, label);
  assert.equal(result.hit, true, JSON.stringify(result));
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
