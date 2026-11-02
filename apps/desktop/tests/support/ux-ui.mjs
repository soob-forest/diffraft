import assert from "node:assert/strict";
import { Key } from "webdriverio";
import { editor, invoke } from "./review-fixture.mjs";

export async function selectDiffText(text, side = "after") {
  if ((await $("button=나란히").getAttribute("aria-pressed")) !== "true")
    await $("button=나란히").click();
  let found;
  for (const line of await $$(`[data-testid="diff-${side}"] .cm-line`))
    if ((await line.getText()).includes(text)) {
      found = line;
      break;
    }
  assert.ok(found, "합성 문장이 비교에 있어야 합니다");
  await found.click();
  await browser.execute(
    (side) => document.querySelector(`[data-testid="diff-${side}"]`).focus(),
    side,
  );
  await browser.keys([Key.Command, Key.ArrowLeft]);
  await browser.keys([
    Key.Shift,
    Key.ArrowRight,
    Key.ArrowRight,
    Key.ArrowRight,
  ]);
}
export async function currentBatch(fixture) {
  return (
    await invoke("review_command", {
      request: {
        schemaVersion: 1,
        action: {
          kind: "projection",
          batchId: fixture.batch.id,
          expectedHeadId: fixture.batch.applyHeadId,
        },
      },
    })
  ).value.batch;
}
export async function storedSelection(fixture) {
  await browser.waitUntil(async () =>
    (await $("footer .draft-status").getText()).includes("저장됨"),
  );
  const records = await editor({ kind: "read_drafts" });
  const index = records.find(
    (record) =>
      record.key ===
      JSON.stringify([
        "selected-request",
        fixture.document.id,
        fixture.task.id,
        "active",
      ]),
  );
  const key = JSON.parse(index.valueJson).key;
  return JSON.parse(records.find((record) => record.key === key).valueJson)
    .target;
}
export async function focusMatches(selector) {
  return browser.execute(
    (selector) => document.activeElement?.matches(selector),
    selector,
  );
}
export async function aiPreference(action) {
  return invoke("ai_settings_command", {
    request: { schemaVersion: 1, action },
  });
}
export async function assertButtonHit(selector) {
  await $(selector).scrollIntoView({ block: "center" });
  const result = await browser.execute((selector) => {
    const button = document.querySelector(selector),
      rect = button.getBoundingClientRect();
    return {
      hit: button.contains(
        document.elementFromPoint(
          rect.x + rect.width / 2,
          rect.y + rect.height / 2,
        ),
      ),
      height: rect.height,
      viewport: [innerWidth, innerHeight],
    };
  }, selector);
  assert.equal(result.hit, true, JSON.stringify(result));
}
