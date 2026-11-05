import assert from "node:assert/strict";
import { activeFollowup, recordFollowup } from "./review-followup-fixture.mjs";
import { settleUnitDisplay } from "./unit-review-display.mjs";
import { chooseUnit, current } from "./unit-review-fixture.mjs";
import {
  assertUnitInvariant,
  readUnitInvariant,
} from "./unit-review-invariants.mjs";

const textSelector = `${activeFollowup} .text-diff`;
const pageSize = 50;

export async function assertSelectedTextPage(fixture) {
  const view = await current(fixture);
  const lines = view.hunks.flatMap((hunk) => hunk.lines).filter(changedLine);
  const candidates = textUnitPositions(view, lines);
  const target = candidates.find((entry) => entry.index >= pageSize);
  await recordFollowup("text-plan", {
    changedRows: lines.length,
    units: view.batch.reviewUnits.length,
    candidates,
    target,
  });
  assert(lines.length > 60, "실제 REWRITE 변경행 60개 초과가 필요합니다.");
  assert(target, "첫 페이지 밖에 실제 행이 있는 별도 단위가 필요합니다.");
  const before = await readUnitInvariant(fixture);
  try {
    await $(textSelector).$("summary").click();
    await $(`${textSelector} ol`).waitForDisplayed();
    await chooseUnit(target.id);
    await waitSelectedText(target.number);
    const selected = await readTextSelection(target.number);
    assert(
      selected.rows.some((row) => row.visible && row.hit),
      JSON.stringify(selected),
    );
    assert(selected.start > 1);
    await $(textSelector).$("button=이전 변경 행").click();
    await scrollTextStart();
    const notice = $(textSelector).$("button=선택한 변경 읽기");
    await notice.waitForDisplayed();
    assert.match(await $(textSelector).getText(), /현재 텍스트 페이지 밖/);
    await notice.click();
    await waitSelectedText(target.number);
    const returned = await readTextSelection(target.number);
    assert.equal(returned.start, selected.start);
    assert(
      returned.rows.some((row) => row.visible && row.hit),
      JSON.stringify(returned),
    );
    await recordFollowup("text-selection", { selected, returned });
  } finally {
    await assertUnitInvariant(fixture, before);
  }
}

function changedLine(line) {
  return line.kind === "delete" || line.kind === "insert";
}

function textUnitPositions(view, lines) {
  const offsets = {
    before: lineOffsets(view.before),
    after: lineOffsets(view.after),
  };
  return view.batch.reviewUnits.map((unit) => {
    const group = view.groups.find((item) => item.id === unit.id);
    const index = lines.findIndex((line) => {
      const before = line.kind === "delete";
      const offset =
        offsets[before ? "before" : "after"][
          (before ? line.oldLine : line.newLine) - 1
        ];
      const ranges = before ? group.beforeRanges : group.afterRanges;
      return ranges.some((range) => offset >= range.from && offset < range.to);
    });
    return {
      id: unit.id,
      number: unit.number,
      index,
      ranges: group.beforeRanges.length,
    };
  });
}

function lineOffsets(text) {
  let offset = 0;
  return text.split(/(?<=\n)/u).map((line) => {
    const start = offset;
    offset += Buffer.byteLength(line);
    return start;
  });
}

async function waitSelectedText(number) {
  await browser.waitUntil(
    async () => {
      const state = await readTextSelection(number);
      return state.rows.length > 0;
    },
    {
      timeoutMsg: `텍스트 페이지에 선택한 변경 ${number}의 행이 있어야 합니다.`,
    },
  );
  await settleUnitDisplay();
}

async function readTextSelection(number) {
  return browser.execute((selectedNumber) => {
    const text = document.querySelector(
      ".unit-diff-body:not([hidden]) .text-diff",
    );
    const area = text.getBoundingClientRect();
    const top = Math.max(
      0,
      area.top,
      text.querySelector("summary").getBoundingClientRect().bottom,
    );
    const bottom = Math.min(innerHeight, area.bottom);
    const prefix = `변경 ${selectedNumber} · `;
    return {
      start: text.querySelector("ol")?.start ?? 0,
      rows: [...text.querySelectorAll("li")]
        .filter(
          (row) =>
            row.querySelector("strong").textContent.startsWith(prefix) &&
            row.querySelector("strong").textContent.includes("선택됨"),
        )
        .map((row) => {
          const rect = row.getBoundingClientRect();
          const visible = rect.bottom > top && rect.top < bottom;
          const x =
            Math.max(area.left, rect.left) +
            Math.min(area.width, rect.width) / 2;
          const y =
            (Math.max(top, rect.top) + Math.min(bottom, rect.bottom)) / 2;
          return {
            key: row.dataset.rowKey,
            label: row.querySelector("strong").textContent,
            rect: rect.toJSON(),
            visible,
            hit: visible && row.contains(document.elementFromPoint(x, y)),
          };
        }),
    };
  }, number);
}

async function scrollTextStart() {
  await browser.execute(() => {
    document.querySelector(
      ".unit-diff-body:not([hidden]) .text-diff",
    ).scrollTop = 0;
  });
  await settleUnitDisplay();
}

export async function assertRelatedTextPage(grouped) {
  const { fixture, view, unit, group } = grouped;
  assert(group.beforeRanges.length >= 2, "실제 여러 관련 범위가 필요합니다.");
  const before = await readUnitInvariant(fixture);
  try {
    await $(textSelector).$("summary").click();
    await $(`${textSelector} ol`).waitForDisplayed();
    await chooseUnit(unit.id);
    await waitSelectedText(unit.number);
    const observations = [];
    for (const index of group.beforeRanges.keys()) {
      const key = relatedTextKey(view, group, index);
      assert(key, `관련 위치 ${index + 1}에 실제 변경 행이 필요합니다.`);
      await chooseRelatedTextLocation(index);
      await browser.waitUntil(async () =>
        (await readTextSelection(unit.number)).rows.some(
          (row) => row.key === key && row.visible && row.hit,
        ),
      );
      observations.push({
        index,
        key,
        ...(await readTextSelection(unit.number)),
      });
    }
    await recordFollowup("text-related", {
      ranges: group.beforeRanges.length,
      observations,
    });
  } finally {
    await assertUnitInvariant(fixture, before);
  }
}

async function chooseRelatedTextLocation(index) {
  await browser.execute((next) => {
    const select = document.querySelector(
      ".unit-diff-body:not([hidden]) [aria-label='관련 위치 선택']",
    );
    select.value = String(next);
    select.dispatchEvent(new Event("change", { bubbles: true }));
  }, index);
  await $(activeFollowup).$('button[aria-label="관련 위치로 이동"]').click();
  await settleUnitDisplay();
}

function relatedTextKey(view, group, index) {
  const before = lineOffsets(view.before),
    after = lineOffsets(view.after);
  const line = view.hunks
    .flatMap((hunk) => hunk.lines)
    .find((row) => {
      if (!changedLine(row)) return false;
      const deletion = row.kind === "delete";
      const offset = deletion
        ? before[row.oldLine - 1]
        : after[row.newLine - 1];
      const range = (deletion ? group.beforeRanges : group.afterRanges)[index];
      return offset >= range.from && offset < range.to;
    });
  return line ? `${line.kind}:${line.oldLine}:${line.newLine}` : null;
}
