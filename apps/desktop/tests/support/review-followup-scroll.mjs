import assert from "node:assert/strict";
import {
  activeFollowup,
  enableFollowupContext,
  followupIdentity,
  recordFollowup,
} from "./review-followup-fixture.mjs";
import { settleUnitDisplay } from "./unit-review-display.mjs";
import {
  chooseUnit,
  current,
  showOriginalUnitComparison,
  unitDecision,
} from "./unit-review-fixture.mjs";
import {
  assertUnitInvariant,
  readUnitInvariant,
} from "./unit-review-invariants.mjs";
import { assertReadingLayout } from "./unit-review-layout-checks.mjs";
import {
  captureUnitLayout,
  readUnitScroll,
} from "./unit-review-layout-observation.mjs";

export async function assertComparisonScrollRoundtrip(fixture) {
  await unitDecision("승인", fixture, 0, "ACCEPTED");
  const view = await current(fixture);
  await chooseUnit(view.batch.reviewUnits.at(-1).id);
  await enableFollowupContext();
  const before = await readUnitInvariant(fixture);
  const identity = await followupIdentity();
  const currentScroll = await scrollComparison(0.35);
  const normal = await captureUnitLayout("followup-current-normal", {
    phase: "current-before-first-original",
  });
  assertReadingLayout(normal);
  try {
    await showOriginalUnitComparison();
    await $(`${activeFollowup} .cm-content`).waitForDisplayed();
    await settleUnitDisplay();
    assert.equal(
      await diffHasFocus(),
      false,
      "원래 자동 이동은 포커스를 빼앗으면 안 됩니다.",
    );
    const originalScroll = await scrollComparison(0.7);
    await $("button=현재 검토로 돌아가기").click();
    await settleUnitDisplay();
    const returnedCurrent = await readUnitScroll();
    assertScrollPosition(currentScroll, returnedCurrent);
    await showOriginalUnitComparison();
    await settleUnitDisplay();
    const returnedOriginal = await readUnitScroll();
    assertScrollPosition(originalScroll, returnedOriginal);
    assert.equal(await diffHasFocus(), false);
    await recordFollowup("comparison-scroll", {
      currentScroll,
      originalScroll,
      returnedCurrent,
      returnedOriginal,
    });
    assert.deepEqual(await followupIdentity(), identity);
  } finally {
    await assertUnitInvariant(fixture, before);
  }
}

async function scrollComparison(fraction) {
  await browser.execute((ratio) => {
    for (const node of document.querySelectorAll(
      ".unit-diff-body:not([hidden]) .cm-scroller",
    ))
      node.scrollTop = (node.scrollHeight - node.clientHeight) * ratio;
  }, fraction);
  await settleUnitDisplay();
  const result = await readUnitScroll();
  assert(result.scrollers.length > 0);
  for (const pane of result.scrollers) {
    assert(
      pane.extent > pane.height + 80,
      "수동 스크롤 가능한 긴 본문이 필요합니다.",
    );
    assert(pane.top > 0);
    assert(pane.firstVisibleKey);
  }
  return result;
}

function assertScrollPosition(before, after) {
  assert.equal(after.scrollers.length, before.scrollers.length);
  for (const [index, pane] of after.scrollers.entries()) {
    assert.equal(pane.firstVisibleKey, before.scrollers[index].firstVisibleKey);
    assert(
      Math.abs(pane.top - before.scrollers[index].top) <= 2,
      `비교 왕복 scrollTop 불일치: ${JSON.stringify({ before, after })}`,
    );
  }
}

async function diffHasFocus() {
  return browser.execute(() => !!document.activeElement?.closest(".diff-pane"));
}
