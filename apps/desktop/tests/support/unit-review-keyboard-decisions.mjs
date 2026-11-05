import assert from "node:assert/strict";
import {
  chooseUnit,
  current,
  setUnitFilter,
  unitDecision,
} from "./unit-review-fixture.mjs";
import {
  assertUnitInvariant,
  readUnitInvariant,
} from "./unit-review-invariants.mjs";
import {
  focusKeyboardTarget,
  nativeKey,
  nativeKeys,
  readNativeKeyTrace,
} from "./unit-review-key-events.mjs";

const heldKeys = [
  {
    key: "Enter",
    down: nativeKey.downEnter,
    repeat: nativeKey.repeatEnter,
    up: nativeKey.upEnter,
  },
  {
    key: " ",
    down: nativeKey.downSpace,
    repeat: nativeKey.repeatSpace,
    up: nativeKey.upSpace,
  },
];

export async function assertApprovalAutorepeatBlocked(fixture) {
  const before = await readUnitInvariant(fixture);
  for (const command of heldKeys) {
    await assertHeldKey(fixture, ".unit-actions .primary", command);
    await assertUnitInvariant(fixture, before);
  }
  await assertUnitInvariant(fixture, before);
}

async function assertHeldKey(fixture, target, command) {
  const start = (await readNativeKeyTrace()).length;
  const origin =
    target === ".unit-progress strong" ? target : ".unit-selected-heading";
  await focusKeyboardTarget(origin);
  try {
    nativeKeys(fixture.pid, [command.down]);
    const down = (await readNativeKeyTrace())
      .slice(start)
      .find(
        (event) =>
          event.type === "keydown" &&
          event.key === command.key &&
          !event.repeat &&
          event.isTrusted &&
          event.holdOrigin &&
          !event.approvalTarget,
      );
    assert(down, `${command.key} 실제 hold의 시작 keydown을 확인해야 합니다.`);
    await focusKeyboardTarget(target);
    nativeKeys(fixture.pid, [command.repeat]);
    assertHeldKeyTrace(
      (await readNativeKeyTrace()).slice(start),
      target,
      command.key,
    );
  } finally {
    nativeKeys(fixture.pid, [command.up]);
  }
}

function assertHeldKeyTrace(trace, target, key) {
  const events = trace.filter((event) => event.key === key && event.isTrusted);
  const fresh = events.findIndex(
    (event) => event.type === "keydown" && !event.repeat && event.holdOrigin,
  );
  const repeat = events.findIndex(
    (event, index) => index > fresh && event.type === "keydown" && event.repeat,
  );
  const up = events.findIndex(
    (event, index) => index > repeat && event.type === "keyup",
  );
  assert(
    fresh >= 0 && repeat > fresh && up > repeat,
    `${key} trusted freshdown → repeatdown → keyup 순서를 확인해야 합니다.`,
  );
  assert.equal(
    events[repeat].approvalTarget,
    target === ".unit-actions .primary",
  );
  if (target !== ".unit-actions .primary") assert(events[repeat].holdOrigin);
}

export async function assertFreshDecisionFocus(fixture) {
  await focusKeyboardTarget(".unit-actions .primary");
  nativeKeys(fixture.pid, [nativeKey.enter]);
  await waitAccepted(fixture, 1);
  await browser.waitUntil(() =>
    browser.execute(() =>
      document.activeElement?.matches(".unit-selected-heading"),
    ),
  );
  assert.match(
    await $(".unit-feedback").getText(),
    /변경 1 승인 완료.*v15 저장됨/,
  );
  const before = await readUnitInvariant(fixture);
  nativeKeys(fixture.pid, [nativeKey.enter, nativeKey.space]);
  for (const command of heldKeys)
    await assertHeldKey(fixture, ".unit-selected-heading", command);
  await assertUnitInvariant(fixture, before);
}

export async function assertLastDecisionCompletion(fixture) {
  await setUnitFilter("pending");
  await chooseUnit(fixture.batch.reviewUnits[0].id);
  await unitDecision("승인", fixture, 0, "ACCEPTED");
  await chooseUnit(fixture.batch.reviewUnits[1].id);
  await unitDecision("승인", fixture, 1, "ACCEPTED");
  await chooseUnit(fixture.batch.reviewUnits[2].id);
  await $(".unit-actions .primary").waitForEnabled();
  await focusKeyboardTarget(".unit-actions .primary");
  nativeKeys(fixture.pid, [nativeKey.enter]);
  await waitAccepted(fixture, 3);
  await browser.waitUntil(() =>
    browser.execute(() =>
      document.activeElement?.matches(".unit-progress strong"),
    ),
  );
  assert.equal(await $(".unit-progress strong").getText(), "검토 완료");
  assert.equal(await $(".unit-picker select").getValue(), "");
  const before = await readUnitInvariant(fixture);
  assert.equal(before.version, 17);
  nativeKeys(fixture.pid, [nativeKey.enter, nativeKey.space]);
  for (const command of heldKeys)
    await assertHeldKey(fixture, ".unit-progress strong", command);
  await assertUnitInvariant(fixture, before);
}

async function waitAccepted(fixture, count) {
  await browser.waitUntil(
    async () =>
      (await current(fixture)).batch.proposals.filter(
        (proposal) => proposal.decision === "ACCEPTED",
      ).length === count,
  );
}
