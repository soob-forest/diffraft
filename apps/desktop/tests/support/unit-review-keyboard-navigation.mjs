import assert from "node:assert/strict";
import {
  chooseUnit,
  current,
  setUnitFilter,
  showUnitComment,
  unitDecision,
} from "./unit-review-fixture.mjs";
import {
  assertUnitInvariant,
  readUnitInvariant,
} from "./unit-review-invariants.mjs";
import {
  activeKeyboardFocus,
  focusKeyboardTarget,
  nativeKey,
  nativeKeys,
  readNativeKeyTrace,
} from "./unit-review-key-events.mjs";

export async function assertNativeCommentKeys(fixture) {
  const before = await readUnitInvariant(fixture);
  await focusKeyboardTarget(".unit-picker select");
  nativeKeys(fixture.pid, [nativeKey.tab]);
  const tabFocus = await activeKeyboardFocus();
  assert.match(tabFocus.label, /이전 미처리 변경/);
  assert.equal(tabFocus.hidden, false);
  assert.equal(tabFocus.hit, true);
  await showUnitComment();
  await $(".unit-comments textarea").setValue("입력 유지");
  await browser.execute(() => {
    const input = document.querySelector(".unit-comments textarea");
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
  });
  nativeKeys(fixture.pid, [nativeKey.enter]);
  await browser.waitUntil(
    async () =>
      (await $(".unit-comments textarea").getValue()) === "입력 유지\n",
  );
  nativeKeys(fixture.pid, [nativeKey.escape]);
  await browser.waitUntil(() =>
    browser.execute(() =>
      document.activeElement?.matches(".unit-comment-trigger"),
    ),
  );
  await showUnitComment();
  assert.equal(await $(".unit-comments textarea").getValue(), "입력 유지\n");
  nativeKeys(fixture.pid, [nativeKey.escape]);
  assert(
    (await readNativeKeyTrace()).some(
      (event) => event.key === "Tab" && event.isTrusted,
    ),
  );
  await assertUnitInvariant(fixture, before);
}

export async function assertSyntheticCompositionEscape(fixture) {
  const before = await readUnitInvariant(fixture);
  await showUnitComment();
  await $(".unit-comments textarea").setValue("조합 보호용 합성 입력");
  try {
    await syntheticCompositionEscape();
    assert.equal(await $(".unit-comments textarea").isDisplayed(), true);
    assert.equal(
      await $(".unit-comments textarea").getValue(),
      "조합 보호용 합성 입력",
    );
    assert.equal(
      await browser.execute(() =>
        document.activeElement?.matches(".unit-comments textarea"),
      ),
      true,
    );
    const trace = await readNativeKeyTrace();
    assert(
      trace.some(
        (event) =>
          event.key === "Escape" && event.isComposing && !event.isTrusted,
      ),
    );
    await assertUnitInvariant(fixture, before);
  } finally {
    await browser.execute(() =>
      document
        .querySelector(".unit-comments textarea")
        ?.dispatchEvent(
          new CompositionEvent("compositionend", { bubbles: true, data: "ㅎ" }),
        ),
    );
  }
}

async function syntheticCompositionEscape() {
  await browser.execute(() => {
    const input = document.querySelector(".unit-comments textarea");
    input.focus();
    input.dispatchEvent(
      new CompositionEvent("compositionstart", { bubbles: true, data: "ㅎ" }),
    );
    input.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Escape",
        code: "Escape",
        isComposing: true,
        bubbles: true,
        cancelable: true,
      }),
    );
  });
}

export async function assertPendingNativeCycle(fixture) {
  const initial = await readUnitInvariant(fixture);
  await focusKeyboardTarget(".unit-diff-body:not([hidden]) .cm-content");
  await nativeMoves(fixture, [
    [nativeKey.next, 2],
    [nativeKey.previous, 1],
    [nativeKey.previous, 3],
    [nativeKey.next, 1],
  ]);
  await assertUnitInvariant(fixture, initial);
  await chooseUnit(fixture.batch.reviewUnits[1].id);
  await unitDecision("거절", fixture, 1, "REJECTED");
  await setUnitFilter("pending");
  await chooseUnit(fixture.batch.reviewUnits[0].id);
  const before = await readUnitInvariant(fixture);
  await focusKeyboardTarget(".unit-diff-body:not([hidden]) .cm-content");
  await nativeMoves(fixture, [
    [nativeKey.next, 3],
    [nativeKey.next, 1],
    [nativeKey.previous, 3],
  ]);
  await assertUnitInvariant(fixture, before);
  assert(
    (await readNativeKeyTrace()).some(
      (event) => event.key === "F7" && event.shiftKey && event.isTrusted,
    ),
  );
}

export async function assertProcessedNativeCycle(fixture) {
  await chooseUnit(fixture.batch.reviewUnits[1].id);
  await unitDecision("거절", fixture, 1, "REJECTED");
  await setUnitFilter("processed");
  await $(".unit-diff-body:not([hidden]) .cm-content").waitForDisplayed();
  const before = await readUnitInvariant(fixture);
  await focusKeyboardTarget(".unit-diff-body:not([hidden]) .cm-content");
  await nativeMoves(fixture, [
    [nativeKey.next, 2],
    [nativeKey.previous, 2],
    [nativeKey.next, 2],
  ]);
  await assertUnitInvariant(fixture, before);
}

export async function assertEmptyFilterNativeKeys(fixture) {
  await setUnitFilter("processed");
  const before = await readUnitInvariant(fixture);
  await focusKeyboardTarget(".unit-diff-body:not([hidden]) .cm-content");
  nativeKeys(fixture.pid, [
    nativeKey.next,
    nativeKey.previous,
    nativeKey.enter,
    nativeKey.space,
  ]);
  assert.equal(await $(".unit-picker select").getValue(), "");
  assert.equal(await $(".unit-picker select").isEnabled(), false);
  assert.equal((await $$(".unit-actions .unit-decision")).length, 0);
  for (const button of await $$(".unit-actions button"))
    assert.equal(await button.isEnabled(), false);
  await assertUnitInvariant(fixture, before);
}

async function nativeMoves(fixture, steps) {
  for (const [command, number] of steps) {
    nativeKeys(fixture.pid, [command]);
    const id = fixture.batch.reviewUnits.find(
      (unit) => unit.number === number,
    ).id;
    await browser.waitUntil(
      async () => (await $(".unit-picker select").getValue()) === id,
    );
  }
  assert.equal((await current(fixture)).batch.id, fixture.batch.id);
}
