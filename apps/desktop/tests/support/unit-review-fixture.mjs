import assert from "node:assert/strict";
import { editor, invoke, reviewState, root } from "./rewrite-fixture.mjs";
import { settleUnitDisplay } from "./unit-review-display.mjs";

export { editor, invoke, reviewState, root };
export async function command(action) {
  return (
    await invoke("review_command", { request: { schemaVersion: 1, action } })
  ).value;
}
export async function current(fixture) {
  const state = await editor({ kind: "read", documentId: fixture.document.id });
  return command({
    kind: "projection",
    batchId: fixture.batch.id,
    expectedHeadId: state.document.versionId,
  });
}
export async function chooseUnit(id) {
  const included = await browser.execute(
    (value) =>
      [...document.querySelector(".unit-picker select").options].some(
        (option) => option.value === value,
      ),
    id,
  );
  if (!included) await setUnitFilter("all");
  await browser.execute((value) => {
    const select = document.querySelector(".unit-picker select");
    select.value = value;
    select.dispatchEvent(new Event("change", { bubbles: true }));
  }, id);
  await browser.waitUntil(
    async () => (await $(".unit-picker select").getValue()) === id,
  );
}
export async function setUnitFilter(value) {
  const before = await settleUnitLayout();
  await browser.execute((next) => {
    const select = document.querySelector(".unit-progress .unit-filter select");
    select.value = next;
    select.dispatchEvent(new Event("change", { bubbles: true }));
  }, value);
  const after = await settleUnitLayout();
  const filters = await browser.execute(() =>
    [...document.querySelectorAll(".unit-filter select")].map(
      (select) => select.value,
    ),
  );
  assert(
    filters.length > 0 && filters.every((filter) => filter === value),
    `목록과 중앙 필터가 모두 ${value}여야 합니다: ${JSON.stringify({ before, after, filters })}`,
  );
}
export async function openUnitMenu() {
  if (!(await $(".unit-options-popup:popover-open").isExisting()))
    await $("button=검토 도구").click();
  await $(".unit-options-popup:popover-open").waitForDisplayed();
}
export async function closeUnitMenu() {
  const menu = $(".unit-options-popup:popover-open");
  if (await menu.isExisting()) await menu.$("button=도구 닫기").click();
  await browser.waitUntil(
    async () => !(await $(".unit-options-popup:popover-open").isExisting()),
  );
}
export async function showOriginalUnitComparison() {
  await openUnitMenu();
  await $(".unit-options-popup:popover-open")
    .$("button=원래 전체 후보 보기")
    .click();
  await $(".unit-original-notice").waitForDisplayed();
  assert.equal(await $(".unit-options-popup:popover-open").isExisting(), false);
}
export async function openRemainingApproval(count) {
  await openUnitMenu();
  const button = $(".unit-options-popup:popover-open").$(
    `button=남은 변경 ${count}개 승인…`,
  );
  await button.waitForEnabled();
  await button.click();
  await $(".approval-dialog[open]").waitForDisplayed();
  assert.equal(await $(".unit-options-popup:popover-open").isExisting(), false);
}
export async function settleUnitLayout() {
  return settleUnitDisplay();
}
export async function showUnitComment() {
  await $("button=코멘트").click();
  await $(".unit-comments textarea").waitForDisplayed();
}
export async function unitDecision(button, fixture, index, expected) {
  const number = (await current(fixture)).batch.reviewUnits[index].number;
  const target = $(".unit-actions").$(`button=변경 ${number} ${button}`);
  await target.waitForEnabled();
  await target.click();
  await browser.waitUntil(async () => {
    const view = await current(fixture);
    return (
      view.batch.proposals.find(
        (p) => p.groupId === view.batch.reviewUnits[index].id,
      )?.decision === expected
    );
  });
}
export async function assertNoMutation(fixture, version) {
  assert.equal(
    (await editor({ kind: "read", documentId: fixture.document.id })).document
      .version,
    version,
  );
}
