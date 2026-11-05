import { expect, it } from "vitest";
import { displayRows } from "../src/review/coordinates";
import { groupRangeStarts } from "../src/review/decorations";
import type { ReviewRow } from "../src/review/rows";
import { intersectsReadingArea } from "../src/review/useUnitVisibility";

it("marks each separated range of the same unit and aligns its gutter heading", () => {
  const rows = ["first", "insert", "context", "second", "other", "third"].map(
    (key) => ({ key, raw: key, folded: 0 }),
  ) as ReviewRow[];
  const mark = { id: "unit-7", title: "변경 7 · 결합", selected: true };
  const markers = new Map([
    ["first", mark],
    ["insert", mark],
    ["second", mark],
    ["other", { ...mark, id: "unit-9" }],
    ["third", mark],
  ]);
  expect([...groupRangeStarts(displayRows(rows), markers)]).toEqual([
    "first",
    "second",
    "other",
    "third",
  ]);
  expect(groupRangeStarts(displayRows(rows))).toEqual(new Set());
});
it("only considers selected ranges inside the visible reading area", () => {
  const area = { top: 100, bottom: 240, left: 20, right: 400 };
  expect(intersectsReadingArea({ ...area, top: 90, bottom: 110 }, area)).toBe(
    true,
  );
  expect(intersectsReadingArea({ ...area, bottom: 100, top: 80 }, area)).toBe(
    false,
  );
  expect(intersectsReadingArea({ ...area, top: 240, bottom: 280 }, area)).toBe(
    false,
  );
  expect(intersectsReadingArea({ ...area, left: 400, right: 500 }, area)).toBe(
    false,
  );
});
it("does not report a range inside an empty or inverted clip", () => {
  const range = { top: 0, bottom: 300, left: 0, right: 500 };
  expect(
    intersectsReadingArea(range, {
      top: 200,
      bottom: 100,
      left: 0,
      right: 500,
    }),
  ).toBe(false);
  expect(
    intersectsReadingArea(range, { top: 0, bottom: 300, left: 40, right: 40 }),
  ).toBe(false);
});
