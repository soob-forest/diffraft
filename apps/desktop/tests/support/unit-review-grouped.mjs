import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import {
  confirmed,
  prepareRewrite,
  requestRewrite,
  start,
  waitCandidate,
} from "./rewrite-fixture.mjs";
import {
  chooseUnit,
  closeUnitMenu,
  current,
  invoke,
  openUnitMenu,
  settleUnitLayout,
  setUnitFilter,
} from "./unit-review-fixture.mjs";
import {
  readGroupedTitle,
  readGroupedWrapping,
  readRangeMarkers,
} from "./unit-review-grouped-observation.mjs";
import {
  captureMainReview,
  closeGroupedDetail,
  restoreMainReview,
  reviewInvariant,
  setGroupedSize,
} from "./unit-review-grouped-state.mjs";
import { assertReadingLayout } from "./unit-review-layout-checks.mjs";
import {
  activeComparison,
  captureUnitLayout,
  layoutDirectory,
  readSelectedRows,
} from "./unit-review-layout-observation.mjs";

const TITLE_MINIMUM = 70;
const LONG_TITLE = "여행 준비와 실행을 연결하는 긴 제목 ".repeat(16).trim();
const PREPARATION =
  "준비 확인이 끝나면 동행인에게 바로 알립니다.\n출발 시간과 이동 경로를 함께 기록합니다.";
const CASES = [
  { width: 1280, height: 800, zoom: 1 },
  { width: 800, height: 600, zoom: 2 },
];

export async function assertGroupedUnitReview(mainFixture) {
  const saved = await captureMainReview(mainFixture);
  let grouped;
  try {
    grouped = await prepareGroupedReview();
    const before = await reviewInvariant(grouped.fixture);
    try {
      for (const context of CASES) await inspectGroupedCase(grouped, context);
    } finally {
      assert.deepEqual(
        await reviewInvariant(grouped.fixture),
        before,
        "그룹 읽기·이동 검사는 원문·결정·등록 의견을 바꾸면 안 됩니다.",
      );
    }
  } finally {
    await restoreMainReview(mainFixture, saved);
  }
}

function groupedSource() {
  assert(
    confirmed.startsWith("# 여행 준비 가이드\n"),
    "합성 원본의 첫 제목을 확인해 주세요.",
  );
  assert.equal(
    confirmed.split(PREPARATION).length,
    2,
    "이동할 두 줄 문단은 정확히 한 번 존재해야 합니다.",
  );
  return `${confirmed
    .replace("# 여행 준비 가이드", `### ${LONG_TITLE}`)
    .replace(`${PREPARATION}\n`, "")
    .trimEnd()}\n\n${PREPARATION}\n`;
}

export async function prepareGroupedReview() {
  const workspace = await invoke("get_workspace_snapshot", {
    request: { schemaVersion: 1 },
  });
  assert(
    !workspace.documents.some((document) => document.title === "layout"),
    "새 합성 layout 문서가 필요합니다. 기존 layout 검토를 덮어쓰지 않았습니다.",
  );
  const fixture = await prepareRewrite("layout", groupedSource());
  await requestRewrite();
  await start("REWRITE_UNITS");
  fixture.batch = await waitCandidate(fixture.task.id, 1);
  await $("button=변경별 검토 시작").waitForEnabled();
  await $("button=변경별 검토 시작").click();
  await $(".unit-review").waitForDisplayed();
  const view = await current(fixture);
  const unit = view.batch.reviewUnits.find(
    (item) =>
      item.proposals.length >= 2 && [...item.title].length >= TITLE_MINIMUM,
  );
  await captureUnitLayout("grouped-plan", {
    state: "grouped",
    units: view.batch.reviewUnits.map((item) => ({
      number: item.number,
      titleLength: [...item.title].length,
      operations: item.proposals.length,
    })),
  });
  assert(
    unit,
    "실제 생성 계획에 긴 제목과 두 개 이상 operation을 가진 결합 단위가 필요합니다.",
  );
  const group = view.groups.find((entry) => entry.id === unit.id);
  assert(
    group && group.beforeRanges.length >= 2,
    "결합 단위의 실제 관련 범위를 확인할 수 없습니다.",
  );
  return { fixture, view, unit, group };
}

async function inspectGroupedCase(grouped, context) {
  await closeGroupedDetail();
  await setGroupedSize(context.width, context.height, context.zoom);
  await setUnitFilter("pending");
  await chooseUnit(grouped.unit.id);
  await settleUnitLayout();
  const name = `grouped-${context.width}-${context.zoom}`;
  const initial = await captureUnitLayout(`${name}-initial`, {
    ...context,
    state: "grouped",
    phase: "after-resize-and-selection-before-range-moves",
  });
  assertReadingLayout(initial);
  const wrapping = await readGroupedWrapping();
  assert(wrapping.length > 0);
  for (const pane of wrapping)
    assert(
      pane.extent <= pane.width + 1,
      `긴 변경 본문이 내부 가로 스크롤 없이 줄바꿈되어야 합니다. ${JSON.stringify(pane)}`,
    );
  assert(
    initial.controls.some(
      (control) =>
        control.label === `변경 ${grouped.unit.number} 승인` &&
        control.centerHit,
    ),
  );
  await inspectFullTitle(grouped.unit, name, context);
  await inspectRelatedRanges(grouped, name, context);
}

async function inspectFullTitle(unit, name, context) {
  await openUnitMenu();
  try {
    await browser.execute(() =>
      document.querySelector(".unit-information h4").scrollIntoView({
        block: "center",
        inline: "nearest",
        behavior: "instant",
      }),
    );
    await settleUnitLayout();
    const probe = await readGroupedTitle();
    await captureUnitLayout(`${name}-title`, {
      ...context,
      state: "grouped",
      phase: "explicit-long-title-in-tools",
    });
    await writeFile(
      `${layoutDirectory}/${name}-title-probes.json`,
      JSON.stringify(probe, null, 2),
    );
    assert.equal(probe.text, `변경 ${unit.number} · ${unit.title}`);
    assert(
      probe.fullyVisible && !probe.clipped && probe.hit,
      "긴 단위 제목 전문이 도구 안에서 잘리거나 가려집니다.",
    );
  } finally {
    await closeUnitMenu();
  }
}

async function inspectRelatedRanges(grouped, name, context) {
  const selector = `${activeComparison} [aria-label="관련 위치 선택"]`;
  const values = await browser.execute(
    (query) =>
      [...document.querySelector(query).options].map((option) => option.value),
    selector,
  );
  assert.deepEqual(
    values,
    grouped.group.beforeRanges.map((_range, index) => String(index)),
  );
  for (const [index, value] of values.entries()) {
    await browser.execute(
      (query, next) => {
        const select = document.querySelector(query);
        select.value = next;
        select.dispatchEvent(new Event("change", { bubbles: true }));
      },
      selector,
      value,
    );
    await inspectRelatedRange(grouped, { ...context, name, index });
  }
}

async function inspectRelatedRange(grouped, context) {
  const { index, name } = context;
  await $(activeComparison).$('button[aria-label="관련 위치로 이동"]').click();
  await browser.waitUntil(
    async () => rangeVisible(await readSelectedRows(), grouped, index),
    {
      timeoutMsg: `결합 단위의 관련 위치 ${index + 1}에 실제 선택 변경이 보여야 합니다.`,
    },
  );
  await settleUnitLayout();
  const observed = await captureUnitLayout(`${name}-range-${index + 1}`, {
    ...context,
    state: "grouped",
    phase: "explicit-related-location",
    location: index + 1,
  });
  assertReadingLayout(observed);
  assert(rangeVisible(observed.selection, grouped, index));
  const markers = await readRangeMarkers();
  await writeFile(
    `${layoutDirectory}/${name}-range-${index + 1}-markers.json`,
    JSON.stringify(markers, null, 2),
  );
  assert(
    markers.some(
      (marker) =>
        marker.id === grouped.unit.id &&
        marker.visible &&
        marker.marker !== "none" &&
        marker.content.includes(`변경 ${grouped.unit.number} · `) &&
        rowInRange(marker.key, grouped, index),
    ),
    `관련 위치 ${index + 1}의 고정 번호와 좌측 표식이 보여야 합니다.`,
  );
}

function rangeVisible(selection, grouped, index) {
  return (
    selection.selectedId === grouped.unit.id &&
    selection.rows.some((row) => {
      if (!row.visible || row.marker === "none" || row.id !== grouped.unit.id)
        return false;
      return rowInRange(row.key, grouped, index);
    })
  );
}

function rowInRange(key, grouped, index) {
  const [kind, oldLine, newLine] = key.split(":");
  const before = kind === "delete",
    number = Number(before ? oldLine : newLine);
  if (!Number.isSafeInteger(number) || number < 1) return false;
  const source = before ? grouped.view.before : grouped.view.after;
  const range = (
    before ? grouped.group.beforeRanges : grouped.group.afterRanges
  )[index];
  const offset = Buffer.byteLength(
    source
      .split(/(?<=\n)/u)
      .slice(0, number - 1)
      .join(""),
  );
  return !!range && offset >= range.from && offset < range.to;
}
