import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import type { DiffHunk } from "../src/generated/DiffHunk";
import type { GroupMark } from "../src/review/group-selection";
import { reviewRows } from "../src/review/rows";
import { TextDiffPages } from "../src/review/TextDiff";
import { changedTextLines } from "../src/review/text-diff-model";
import {
  reconcileTextPage,
  selectedTextPages,
  type TextPageState,
  textDiffJump,
  textJumpPage,
} from "../src/review/text-diff-navigation";

function fixture() {
  const lines = Array.from({ length: 120 }, (_, index) => ({
    kind: "delete",
    oldLine: index + 1,
    newLine: null,
    segments: [{ text: `row ${index + 1}\n`, changed: true }],
  }));
  const hunks: DiffHunk[] = [
    {
      oldRange: { from: 0, to: 0 },
      newRange: { from: 0, to: 0 },
      groupIds: ["first", "second"],
      lines,
    },
  ];
  const markers = new Map<string, GroupMark>(
    lines.map((line, index) => [
      `delete:${line.oldLine}:null`,
      {
        id: index < 50 ? "first" : "second",
        title: index < 50 ? "변경 1" : "변경 2",
        selected: index >= 50,
      },
    ]),
  );
  return { hunks, markers };
}

it("opens the page containing the selected unit beyond the first fifty rows", () => {
  const markup = renderToStaticMarkup(
    createElement(TextDiffPages, { ...fixture(), selectedGroup: "second" }),
  );
  expect(markup).toContain("변경 행 51–100");
  expect(markup).toContain("변경 2 · 선택됨");
  expect(markup).toContain('data-row-key="delete:51:null"');
  expect(markup).not.toContain("<pre>row 1</pre>");
});

it("states that a selected unit has no changed rows in the displayed comparison", () => {
  const markup = renderToStaticMarkup(
    createElement(TextDiffPages, { ...fixture(), selectedGroup: "processed" }),
  );
  expect(markup).toContain("선택한 변경은 이 비교에 변경 행이 없습니다.");
});

it("keeps manual pages across marker refreshes and follows a changed unit", () => {
  const { hunks, markers } = fixture();
  const lines = changedTextLines(hunks);
  const selected = selectedTextPages(lines, markers, "second");
  expect(selected.pages).toEqual([1, 2]);
  const manual: TextPageState = { selectedGroup: "second", page: 2 };
  const target = { selectedGroup: "second", selectedPage: 1, jumpPage: null };
  expect(reconcileTextPage(manual, target)).toBe(manual);
  expect(selectedTextPages(lines, new Map(markers), "second")).toEqual(
    selected,
  );
  expect(
    reconcileTextPage(manual, {
      ...target,
      selectedGroup: "first",
      selectedPage: 0,
    }),
  ).toMatchObject({ selectedGroup: "first", page: 0 });
  expect(
    reconcileTextPage(manual, {
      ...target,
      selectedGroup: undefined,
      selectedPage: null,
    }),
  ).toMatchObject({ selectedGroup: undefined, page: 0 });
});

it("follows each explicit related-location jump without replaying it on a manual page", () => {
  const { hunks, markers } = fixture();
  const lines = changedTextLines(hunks);
  const jump = { serial: 3, rowKey: "delete:110:null" };
  const jumpPage = textJumpPage(lines, markers, "second", jump);
  expect(jumpPage).toBe(2);
  const target = { selectedGroup: "second", selectedPage: 1, jump, jumpPage };
  const moved = reconcileTextPage({ page: 1, selectedGroup: "second" }, target);
  expect(moved.page).toBe(2);
  const manual = { ...moved, page: 0 };
  expect(reconcileTextPage(manual, target)).toBe(manual);
  expect(reconcileTextPage(manual, { ...target, jump: null })).toBe(manual);
  expect(
    reconcileTextPage(manual, {
      ...target,
      jump: { ...jump, serial: 4 },
    }).page,
  ).toBe(2);
  expect(textJumpPage(lines, markers, "first", jump)).toBeNull();
  expect(
    textJumpPage(lines, markers, "second", { ...jump, rowKey: "missing" }),
  ).toBeNull();
});

function unicodeRows() {
  const before = "한글😀\nold\n",
    after = "한글😀\nnew\n";
  return reviewRows(
    {
      before,
      after,
      hunks: [
        {
          oldRange: { from: 11, to: 15 },
          newRange: { from: 11, to: 15 },
          groupIds: [],
          lines: [
            {
              kind: "delete",
              oldLine: 2,
              newLine: null,
              segments: [{ text: "old\n", changed: true }],
            },
            {
              kind: "insert",
              oldLine: null,
              newLine: 2,
              segments: [{ text: "new\n", changed: true }],
            },
          ],
        },
      ],
    },
    new Set(),
    true,
  );
}

it("maps jumps through the displayed comparison's UTF-16 coordinates", () => {
  const rows = unicodeRows();
  expect(
    textDiffJump(rows, {
      serial: 8,
      selection: { side: "before", from: 5, to: 5 },
    }),
  ).toEqual({ serial: 8, rowKey: "delete:2:null" });
  expect(
    textDiffJump(rows, {
      serial: 9,
      selection: { side: "after", from: 5, to: 5 },
    }),
  ).toEqual({ serial: 9, rowKey: "insert:null:2" });
  expect(
    textDiffJump(rows, {
      serial: 10,
      selection: { side: "before", from: 0, to: 0 },
    }),
  ).toBeNull();
});

it("keeps unselected history reading on page one without unit notices", () => {
  const { hunks } = fixture();
  const markup = renderToStaticMarkup(createElement(TextDiffPages, { hunks }));
  expect(markup).toContain("변경 행 1–50");
  expect(markup).not.toContain("선택한 변경");
  const emptySelection = renderToStaticMarkup(
    createElement(TextDiffPages, { ...fixture(), selectedGroup: "" }),
  );
  expect(emptySelection).toContain("선택한 변경이 없습니다.");
  const whole = renderToStaticMarkup(createElement(TextDiffPages, fixture()));
  expect(whole).not.toContain("선택한 변경");
});
