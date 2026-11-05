import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import {
  current,
  setUnitFilter,
  showOriginalUnitComparison,
  showUnitComment,
} from "./unit-review-fixture.mjs";

const evidence = ".artifacts/unit-review/after";
const draftText = "필터 왕복으로 보존할 미등록 의견";

export async function assertEmptyProcessedFilter(fixture) {
  await withNavigation(async () => {
    const view = await current(fixture);
    let observed;
    try {
      await filterUnits("processed");
      observed = await navigationSnapshot();
      await record("empty-filter", observed);
    } finally {
      await filterUnits("pending");
      await selectListedUnit(view.batch.reviewUnits[0].number);
    }
    assert.equal(observed.selectedId, "", "빈 필터에는 선택이 없어야 합니다.");
    assert.equal(observed.filter, "processed");
    assert.equal(observed.centralFilter, "processed");
    assert.deepEqual(observed.optionIds, []);
    assert.equal(observed.listCount, 0);
    assert.equal(observed.enabledDecisions, 0);
    assert.equal(observed.enabledMoves, 0);
  });
}

export async function assertFilteredSelection(fixture) {
  await withNavigation(async () => {
    const view = await current(fixture);
    let observed;
    try {
      await filterUnits("pending");
      await selectListedUnit(3);
      await filterUnits("processed");
      observed = await navigationSnapshot();
      await record("outside-filter", observed);
    } finally {
      await filterUnits("pending");
      await selectListedUnit(3);
    }
    assert.equal(
      observed.selectedId,
      view.batch.reviewUnits[0].id,
      "선택이 필터 밖이면 고정 번호의 첫 일치 변경을 선택해야 합니다.",
    );
    assert.equal(observed.pressedCount, 1);
    assert.equal(observed.filter, "processed");
    assert.equal(observed.centralFilter, "processed");
    assert.deepEqual(
      observed.optionIds,
      view.batch.reviewUnits.slice(0, 2).map((unit) => unit.id),
    );
  });
}

export async function assertDraftAcrossFilter(fixture) {
  await withNavigation(async () => {
    const view = await current(fixture);
    await filterUnits("pending");
    await selectListedUnit(3);
    await showUnitComment();
    const previous = await $(".unit-comments textarea").getValue();
    let moved, restored;
    try {
      await $(".unit-comments textarea").setValue(draftText);
      await filterUnits("processed");
      moved = await navigationSnapshot();
      moved.text = await $(".unit-comments textarea").getValue();
      await filterUnits("pending");
      await selectListedUnit(3);
      await showUnitComment();
      restored = await $(".unit-comments textarea").getValue();
      await record("draft-filter", { ...moved, restored });
    } finally {
      await filterUnits("pending");
      await selectListedUnit(3);
      await showUnitComment();
      await $(".unit-comments textarea").setValue(previous);
    }
    assert.equal(moved.selectedId, view.batch.reviewUnits[0].id);
    assert.equal(moved.text, "", "다른 단위에 이전 초안을 이식하면 안 됩니다.");
    assert.equal(
      restored,
      draftText,
      "원래 단위의 의견 초안을 보존해야 합니다.",
    );
  });
}

export async function assertOriginalTextAfterDecisions(fixture) {
  const before = await current(fixture);
  let observed;
  try {
    await showOriginalUnitComparison();
    await $(".unit-diff-body:not([hidden]) .cm-content").waitForDisplayed();
    await openVisibleTextDiff();
    observed = await browser.execute(() => {
      const visible = (node) => Boolean(node.getClientRects().length);
      const visual = [
        ...document.querySelectorAll(
          ".unit-diff-body:not([hidden]) .diff-insert",
        ),
      ]
        .map((node) => node.textContent)
        .join("\n");
      const text = [...document.querySelectorAll(".text-diff ol")]
        .filter(visible)
        .map((node) => node.textContent)
        .join("\n");
      return {
        visualHasTwenty: visual.includes("20분"),
        textHasTwenty: text.includes("20분"),
      };
    });
    await record("original-text", observed);
  } finally {
    await closeTextDiff();
    if (await $("button=현재 검토로 돌아가기").isExisting())
      await $("button=현재 검토로 돌아가기").click();
  }
  assert.equal(observed.visualHasTwenty, true);
  assert.equal(
    observed.textHasTwenty,
    true,
    "원래 후보의 시각 비교와 텍스트 읽기는 거절된 20분 변경을 함께 설명해야 합니다.",
  );
  const after = await current(fixture);
  assert.equal(after.currentHeadId, before.currentHeadId);
  assert.deepEqual(after.batch.proposals, before.batch.proposals);
}

async function openVisibleTextDiff() {
  const direct = $(".unit-diff-body:not([hidden]) .text-diff");
  if (await direct.isExisting()) {
    if ((await direct.getAttribute("open")) === null)
      await direct.$("summary").click();
    return;
  }
  await showUnitComment();
  const options = $(".review-task-options");
  if ((await options.getAttribute("open")) === null)
    await options.$("summary").click();
  const text = options.$(".text-diff");
  if ((await text.getAttribute("open")) === null)
    await text.$("summary").click();
}

async function closeTextDiff() {
  for (const text of await $$(".text-diff[open]"))
    if (await text.isDisplayed()) await text.$("summary").click();
  const options = $(".review-task-options");
  if ((await options.getAttribute("open")) !== null)
    await options.$("summary").click();
}

async function withNavigation(run) {
  const previous = await browser.getWindowSize();
  const wasOpen = await $(".sidebar").isDisplayed();
  await browser.setWindowSize(1440, 900);
  if (!(await $(".sidebar").isDisplayed())) await $("button=문서 목록").click();
  const menu = $(".navigation-more");
  if ((await menu.getAttribute("open")) === null)
    await menu.$("summary").click();
  try {
    await run();
  } finally {
    if (!wasOpen && (await $("button=문서 목록").isDisplayed()))
      await $("button=문서 목록").click();
    await browser.setWindowSize(previous.width, previous.height);
  }
}

async function filterUnits(value) {
  await setUnitFilter(value);
}

async function selectListedUnit(number) {
  await $(".unit-navigation").$(`button*=변경 ${number} ·`).click();
}

async function navigationSnapshot() {
  return browser.execute(() => ({
    filter: document.querySelector(".unit-navigation select")?.value ?? "",
    centralFilter:
      document.querySelector(".unit-progress .unit-filter select")?.value ?? "",
    selectedId: document.querySelector(".unit-picker select")?.value ?? "",
    optionIds: [...document.querySelectorAll(".unit-picker option")]
      .map((option) => option.value)
      .filter(Boolean),
    listCount: document.querySelectorAll(".unit-navigation button").length,
    pressedCount: document.querySelectorAll(
      ".unit-navigation button[aria-pressed=true]",
    ).length,
    enabledDecisions: document.querySelectorAll(
      ".unit-actions .unit-decision:not(:disabled)",
    ).length,
    enabledMoves: [...document.querySelectorAll(".unit-actions button")].filter(
      (node) => /^(이전|다음)/.test(node.textContent.trim()) && !node.disabled,
    ).length,
  }));
}

async function record(name, observed) {
  await mkdir(evidence, { recursive: true });
  await writeFile(
    `${evidence}/ux02-${name}.json`,
    JSON.stringify(observed, null, 2),
  );
  await browser.saveScreenshot(`${evidence}/ux02-${name}.png`);
}
