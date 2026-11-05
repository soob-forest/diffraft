import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  closeFollowupDetail,
  followupIdentity,
  recordFollowup,
} from "./review-followup-fixture.mjs";
import {
  followupDecisionError,
  followupDecisionFailureCalls,
  installFollowupDecisionFailure,
  restoreFollowupDecisionFailure,
} from "./review-followup-transport.mjs";
import {
  foregroundUnitDisplay,
  settleUnitDisplay,
} from "./unit-review-display.mjs";
import { root, showUnitComment } from "./unit-review-fixture.mjs";
import {
  assertUnitInvariant,
  readUnitInvariant,
} from "./unit-review-invariants.mjs";
import {
  captureUnitLayout,
  readUnitControls,
} from "./unit-review-layout-observation.mjs";

const alertSelector = ".unit-review-alert[role=alert]";
const draft = "승인 실패 후에도 보존할 미등록 의견";

export async function assertVisibleDecisionFailure(fixture) {
  await showUnitComment();
  await $(".unit-comments textarea").setValue(draft);
  await closeFollowupDetail();
  await browser.setWindowSize(800, 600);
  await foregroundUnitDisplay(2);
  const invariant = await readUnitInvariant(fixture);
  const identity = await followupIdentity();
  try {
    await installFollowupDecisionFailure(fixture.batch.id);
    await $(".unit-actions .primary").waitForEnabled();
    await $(".unit-actions .primary").click();
    await $(alertSelector).waitForDisplayed();
    assert.match(
      await $(alertSelector).getText(),
      new RegExp(followupDecisionError),
    );
    assert.equal(await followupDecisionFailureCalls(), 1);
    await assertVisibleAlert("decision-failure", {
      zoom: 2,
      width: 800,
      height: 600,
    });
    assert.deepEqual(await followupIdentity(), identity);
    await assertUnitInvariant(fixture, invariant);
    await showUnitComment();
    assert.equal(await $(".unit-comments textarea").getValue(), draft);
  } finally {
    await restoreFollowupDecisionFailure();
    await browser.setWindowSize(1440, 900);
    await foregroundUnitDisplay(1);
  }
}

export async function assertVisibleStaleReason(fixture) {
  const before = await readUnitInvariant(fixture);
  await browser.setWindowSize(800, 600);
  await foregroundUnitDisplay(2);
  const external = "외부 변경 · 합성 잠김 이유 확인\n";
  try {
    await writeFile(join(root, `${fixture.name}.md`), external);
    await $(alertSelector).waitForDisplayed();
    await assertVisibleAlert("stale-reason", {
      zoom: 2,
      width: 800,
      height: 600,
    });
    assert.equal(await $(".unit-actions .primary").isEnabled(), false);
    const after = await readUnitInvariant(fixture);
    assert.deepEqual(after, {
      ...before,
      fileHash: createHash("sha256").update(external).digest("hex"),
      proposals: before.proposals.map((proposal) => ({
        ...proposal,
        validity: proposal.decision === "PENDING" ? "STALE" : proposal.validity,
      })),
    });
  } finally {
    await browser.setWindowSize(1440, 900);
    await foregroundUnitDisplay(1);
  }
}

async function assertVisibleAlert(name, context) {
  await settleUnitDisplay();
  assert.equal(await $(".unit-options-popup:popover-open").isExisting(), false);
  const controls = await readUnitControls(alertSelector);
  assert.equal(controls.length, 1);
  assert(
    controls[0].fullyInViewport && controls[0].centerHit,
    JSON.stringify(controls),
  );
  const layout = await captureUnitLayout(`followup-${name}-layout`, context);
  await recordFollowup(name, {
    controls,
    layout,
    readingHeightPolicy: "측정만 기록: 중요 오류와 복구 제어 노출을 우선함",
  });
}
