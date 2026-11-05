import assert from "node:assert/strict";
import {
  chooseUnit,
  current,
  settleUnitLayout,
  setUnitFilter,
  showUnitComment,
} from "./unit-review-fixture.mjs";
import {
  assertCoreFocus,
  assertReachable,
  assertReadingLayout,
  checkUnitPopup,
  locateSelectedUnit,
  scrollReadingBody,
} from "./unit-review-layout-checks.mjs";
import {
  captureUnitLayout,
  readUnitScroll,
} from "./unit-review-layout-observation.mjs";

const sizes = [
  [1440, 900],
  [1280, 800],
  [800, 600],
];
const scales = [1, 1.5, 2];

export async function checkUnitLayout(fixture) {
  const previous = await browser.getWindowSize();
  const selection = await currentSelection();
  const view = await current(fixture);
  try {
    for (const [width, height] of sizes)
      for (const zoom of scales) {
        await closeDetail();
        await setLayoutSize(width, height, zoom);
        await setUnitFilter("pending");
        await $(".unit-actions .primary").waitForEnabled();
        await inspectLayoutCase(
          { width, height, zoom },
          view.batch.reviewUnits[1].id,
        );
      }
  } finally {
    await restoreLayout(previous, selection);
  }
}

async function inspectLayoutCase(context, processedId) {
  const name = `${context.width}-${context.zoom}`;
  const initial = await captureUnitLayout(`${name}-initial`, {
    ...context,
    state: "review",
    phase: "after-resize-before-test-scroll",
  });
  assertReadingLayout(initial);
  await locateSelectedUnit();
  const located = await captureUnitLayout(`${name}-selected`, {
    ...context,
    state: "review",
    phase: "explicit-selected-location",
  });
  assertReadingLayout(located, context.width === 1280 && context.zoom === 1);
  await assertCoreFocus(name);
  await scrollReadingBody(name, { ...context, state: "review" });
  await checkUnitPopup(name, context);
  const reading = await readUnitScroll();
  const selection = await currentSelection();
  await inspectComment(`${name}-comment`, context);
  await closeDetail();
  assert.equal((await currentSelection()).id, selection.id);
  assertScrollRestored(reading, await readUnitScroll());
  const returned = await captureUnitLayout(`${name}-returned`, {
    ...context,
    state: "review",
    phase: "after-comment-return",
  });
  assertReadingLayout(returned);
  await inspectProcessed(`${name}-processed`, context, processedId);
  await setUnitFilter(selection.filter);
  await chooseUnit(selection.id);
}

async function inspectProcessed(name, context, id) {
  await chooseUnit(id);
  await $(".unit-original-notice").waitForDisplayed();
  await $(".unit-diff-body:not([hidden]) .cm-content").waitForDisplayed();
  await settleUnitLayout();
  const observation = await captureUnitLayout(name, {
    ...context,
    state: "processed",
    phase: "after-explicit-unit-selection",
  });
  assertReadingLayout(observation);
  assert.equal(await $(".unit-actions .primary").isExisting(), false);
  const reopen = $(".unit-actions").$("button=다시 검토");
  assert.equal(await reopen.isEnabled(), true);
  await assertCoreFocus(name);
}

async function inspectComment(name, context) {
  await showUnitComment();
  await settleUnitLayout();
  await captureUnitLayout(`${name}-initial`, {
    ...context,
    state: name.endsWith("error") ? "error" : "comment",
    phase: "after-open-before-test-scroll",
  });
  await assertReachable(".unit-comments textarea", `${name}: opinion`);
  await assertReachable(
    ".unit-comments button[type=submit]",
    `${name}: save/retry`,
  );
  const observation = await captureUnitLayout(name, {
    ...context,
    state: name.endsWith("error") ? "error" : "comment",
    phase: "explicit-input-and-submit-scroll",
  });
  assert.equal(observation.geometry.horizontalOverflow, false);
  if (observation.geometry.rects[".document-main"].width === 0)
    await assertReachable(".panel-return", `${name}: return to body`);
}

export async function checkUnitCommentErrorLayout() {
  const previous = await browser.getWindowSize();
  const selection = await currentSelection();
  try {
    for (const [width, height] of sizes)
      for (const zoom of scales) {
        await setLayoutSize(width, height, zoom);
        await inspectComment(`${width}-${zoom}-error`, { width, height, zoom });
        assert.match(await $(".unit-comments").getText(), /저장할 수 없습니다/);
        assert.equal(
          await $(".unit-comments button[type=submit]").getText(),
          "코멘트 다시 저장",
        );
      }
  } finally {
    await restoreLayout(previous, selection);
  }
}

async function restoreLayout(previous, selection) {
  await closeDetail();
  await setLayoutSize(previous.width, previous.height, 1);
  await setUnitFilter(selection.filter);
  await chooseUnit(selection.id);
  await showUnitComment();
}

async function currentSelection() {
  return browser.execute(() => ({
    id: document.querySelector(".unit-picker select").value,
    filter: document.querySelector(".unit-progress .unit-filter select").value,
  }));
}

function assertScrollRestored(before, after) {
  assert.equal(after.scrollers.length, before.scrollers.length);
  for (const [index, pane] of after.scrollers.entries())
    assert.equal(
      pane.firstVisibleKey,
      before.scrollers[index].firstVisibleKey,
      "코멘트 왕복 뒤 읽던 본문 행을 유지해야 합니다.",
    );
}

async function closeDetail() {
  if (await $("button=본문으로 돌아가기").isDisplayed())
    await $("button=본문으로 돌아가기").click();
  else if (await $("button=작업 패널 접기").isDisplayed())
    await $("button=작업 패널 접기").click();
  await settleUnitLayout();
}

async function setLayoutSize(width, height, zoom) {
  await browser.setWindowSize(width, height);
  await browser.execute(async (scale) => {
    const window = globalThis.__TAURI__.window.getCurrentWindow();
    await window.show();
    await window.setFocus();
    await globalThis.__TAURI__.webview.getCurrentWebview().setZoom(scale);
  }, zoom);
  await browser.waitUntil(
    () => browser.execute(() => document.visibilityState === "visible"),
    { timeout: 2000, timeoutMsg: `${width}/${height}/${zoom}: visible window` },
  );
  await settleUnitLayout();
}
