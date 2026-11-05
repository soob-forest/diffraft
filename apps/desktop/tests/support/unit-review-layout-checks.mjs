import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import {
  closeUnitMenu,
  openUnitMenu,
  settleUnitLayout,
} from "./unit-review-fixture.mjs";
import {
  captureUnitLayout,
  focusUnitControl,
  layoutDirectory,
  readSelectedRows,
  readUnitControls,
  readUnitGeometry,
  readUnitScroll,
} from "./unit-review-layout-observation.mjs";

const MIN_READING_HEIGHT = 80;
const PIXEL_TOLERANCE = 2;

export function assertReadingLayout(observed, representative = false) {
  const { geometry, controls, selection, scroll } = observed;
  const description = JSON.stringify(observed);
  assert.equal(geometry.visibility, "visible", description);
  assert.equal(geometry.horizontalOverflow, false, description);
  assert.equal(geometry.reviewOverflow, false, description);
  assert(controls.length >= 4, description);
  for (const control of controls) {
    assert.equal(
      control.disabled,
      false,
      `유효한 변경의 조작이 잠겨 있습니다: ${control.label}`,
    );
    assert(
      control.fullyInViewport,
      `화면 밖 선택/행동: ${control.label}\n${description}`,
    );
    assert(
      control.centerHit,
      `가려진 선택/행동: ${control.label}\n${description}`,
    );
  }
  for (const pane of scroll.scrollers) {
    assert(pane.height >= MIN_READING_HEIGHT, description);
    assert(["auto", "scroll"].includes(pane.overflowY), description);
  }
  assert(scroll.scrollers.length > 0, description);
  for (const row of selection.rows) {
    assert.equal(row.id, selection.selectedId, description);
    assert.notEqual(
      row.marker,
      "none",
      "선택 범위에는 색 외 좌측 표식이 필요합니다.",
    );
  }
  assert.equal(
    selection.offscreenNotice,
    !selection.rows.some((row) => row.visible),
    description,
  );
  if (representative) assertRepresentativeChange(observed);
}

function assertRepresentativeChange(observed) {
  for (const kind of ["delete", "insert"])
    assert(
      observed.selection.rows.some(
        (row) => row.kind === kind && row.fullyReadable,
      ),
      `1280/100에서 선택 단위의 ${kind} 본문 전체가 결정과 함께 보여야 합니다.\n${JSON.stringify(observed)}`,
    );
  assert(
    observed.controls.some(
      (control) => /변경 \d+ 승인/.test(control.label) && control.centerHit,
    ),
  );
  assert(
    observed.controls.some(
      (control) => /변경 \d+ 거절/.test(control.label) && control.centerHit,
    ),
  );
}

export async function assertCoreFocus(name) {
  const selectors = [
    ".unit-picker select",
    ".unit-actions .primary",
    ".unit-comment-trigger",
  ];
  const probes = [];
  for (const selector of selectors) {
    if (!(await $(selector).isExisting())) continue;
    const probe = await focusUnitControl(selector);
    probes.push({ selector, ...probe });
    assert(
      probe.focused && probe.hit,
      `${name}: 포커스가 가려지면 안 됩니다. ${JSON.stringify(probe)}`,
    );
  }
  await browser.execute(() =>
    document
      .querySelector(".unit-selected-heading")
      .focus({ preventScroll: true }),
  );
  await writeFile(
    `${layoutDirectory}/${name}-focus.json`,
    JSON.stringify(probes, null, 2),
  );
}

export async function scrollReadingBody(name, context) {
  const before = {
    geometry: await readUnitGeometry(),
    scroll: await readUnitScroll(),
  };
  await browser.execute(() => {
    for (const node of document.querySelectorAll(
      ".unit-diff-body:not([hidden]) .cm-scroller",
    ))
      node.scrollTop = node.scrollHeight;
  });
  await settleUnitLayout();
  const after = await captureUnitLayout(`${name}-scrolled`, {
    ...context,
    phase: "explicit-body-scroll-to-end",
  });
  assertReadingLayout(after);
  assert(
    Math.abs(after.scroll.workspaceTop - before.scroll.workspaceTop) <=
      PIXEL_TOLERANCE,
    "본문 스크롤이 바깥 작업 영역을 함께 움직이면 안 됩니다.",
  );
  assert(
    Math.abs(
      after.geometry.rects[".unit-core"].top -
        before.geometry.rects[".unit-core"].top,
    ) <= PIXEL_TOLERANCE,
    "본문을 읽는 동안 선택/결정 도구 위치를 유지해야 합니다.",
  );
  for (const [index, pane] of after.scroll.scrollers.entries())
    if (
      before.scroll.scrollers[index].extent >
      before.scroll.scrollers[index].height + PIXEL_TOLERANCE
    )
      assert(
        pane.top > 0,
        "넘치는 본문은 내부 스크롤로 읽을 수 있어야 합니다.",
      );
  return after;
}

export async function checkUnitPopup(name, context) {
  await openUnitMenu();
  try {
    await settleUnitLayout();
    const popup = await popupGeometry();
    assert(
      popup.contained && popup.cornersHit,
      `${name}: 팝업 잘림/가림 ${JSON.stringify(popup)}`,
    );
    const probes = await probePopupControls();
    await captureUnitLayout(`${name}-tools`, {
      ...context,
      phase: "explicit-open-tools",
    });
    await writeFile(
      `${layoutDirectory}/${name}-tools-probes.json`,
      JSON.stringify({ popup, probes }, null, 2),
    );
  } finally {
    await closeUnitMenu();
  }
}

async function popupGeometry() {
  return browser.execute(() => {
    const node = document.querySelector(".unit-options-popup:popover-open");
    const rect = node.getBoundingClientRect();
    const points = [
      [rect.left + 12, rect.top + 12],
      [rect.right - 12, rect.top + 12],
      [rect.left + 12, rect.bottom - 12],
      [rect.right - 12, rect.bottom - 12],
    ];
    return {
      rect: rect.toJSON(),
      extent: node.scrollHeight,
      height: node.clientHeight,
      contained:
        rect.left >= 0 &&
        rect.top >= 0 &&
        rect.right <= innerWidth &&
        rect.bottom <= innerHeight,
      cornersHit: points.every(([x, y]) =>
        node.contains(document.elementFromPoint(x, y)),
      ),
    };
  });
}

async function probePopupControls() {
  const query =
    ".unit-options-popup:popover-open :is(button, input, select, summary)";
  const probes = [];
  for (const control of await $$(query)) {
    if (!(await control.isDisplayed()) || !(await control.isEnabled()))
      continue;
    await browser.execute(
      (node) =>
        node.scrollIntoView({
          block: "nearest",
          inline: "nearest",
          behavior: "instant",
        }),
      control,
    );
    await settleUnitLayout();
    const probe = await browser.execute((node) => {
      node.focus({ preventScroll: true });
      const rect = node.getBoundingClientRect();
      const popup = node.closest(".unit-options-popup").getBoundingClientRect();
      return {
        label: node.getAttribute("aria-label") || node.textContent.trim(),
        rect: rect.toJSON(),
        popup: popup.toJSON(),
        focused: node === document.activeElement,
        contained:
          rect.top >= popup.top &&
          rect.bottom <= popup.bottom &&
          rect.left >= popup.left &&
          rect.right <= popup.right,
        hit: node.contains(
          document.elementFromPoint(
            (rect.left + rect.right) / 2,
            (rect.top + rect.bottom) / 2,
          ),
        ),
      };
    }, control);
    probes.push(probe);
    assert(
      probe.focused && probe.contained && probe.hit,
      JSON.stringify(probe),
    );
  }
  return probes;
}

export async function locateSelectedUnit() {
  const active = $(".unit-diff-body:not([hidden])");
  const offscreen = active.$(".unit-offscreen");
  if (await offscreen.isExisting()) await offscreen.click();
  else await active.$("button=선택 위치로 이동").click();
  await browser.waitUntil(
    async () => (await readSelectedRows()).rows.some((row) => row.visible),
    { timeoutMsg: "선택 위치 이동 후 실제 변경 본문이 보여야 합니다." },
  );
  await settleUnitLayout();
}

export async function assertReachable(selector, description) {
  await browser.execute(
    (query) =>
      document.querySelector(query).scrollIntoView({
        block: "center",
        inline: "nearest",
        behavior: "instant",
      }),
    selector,
  );
  await settleUnitLayout();
  const controls = await readUnitControls(selector);
  assert(
    controls.length > 0 &&
      controls.every((control) => control.centerHit && control.fullyInViewport),
    `${description}: ${JSON.stringify(controls)}`,
  );
  const probe = await focusUnitControl(selector);
  assert(
    probe.focused && probe.hit,
    `${description}: ${JSON.stringify(probe)}`,
  );
}
