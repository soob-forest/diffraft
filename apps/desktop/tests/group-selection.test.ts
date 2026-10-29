import { expect, it } from "vitest";
import type { ReviewProjection } from "../src/generated/ReviewProjection";
import { displayRows, displaySelection } from "../src/review/coordinates";
import {
  groupAtSelection,
  groupJumpSelection,
  groupRowMarks,
} from "../src/review/group-selection";

import type { ReviewRow } from "../src/review/rows";

const projection = {
  before: "한글\n첫 변경\n둘 변경",
  after: "한글\n새 변경\n둘 변경",
  groups: [
    {
      id: "first",
      beforeRanges: [{ from: 7, to: 17 }],
      afterRanges: [{ from: 7, to: 17 }],
    },
    {
      id: "second",
      beforeRanges: [{ from: 18, to: 28 }],
      afterRanges: [{ from: 18, to: 28 }],
    },
  ],
} as ReviewProjection;

it("maps Korean UTF-16 selections to the independent byte-range approval group", () => {
  expect(
    groupAtSelection(projection, { side: "after", from: 3, to: 6 })?.id,
  ).toBe("first");
  expect(
    groupAtSelection(projection, { side: "before", from: 8, to: 11 })?.id,
  ).toBe("second");
});

it("jumps to an inserted row when the group's before range starts in folded context", () => {
  const rows = [
    {
      key: "fold",
      kind: "fold",
      folded: 8,
      raw: "",
      beforeFrom: null,
      afterFrom: null,
    },
    {
      key: "insert",
      kind: "insert",
      folded: 0,
      raw: "새 변경\n",
      beforeFrom: null,
      afterFrom: 3,
    },
  ] as ReviewRow[];
  const selection = groupJumpSelection(projection, rows, "first");
  expect(selection).toEqual({ side: "after", from: 3, to: 3 });
  expect(
    displaySelection(displayRows(rows), { side: "before", from: 3, to: 7 }),
  ).toBeNull();
  expect(
    selection && displaySelection(displayRows(rows), selection),
  ).not.toBeNull();
});

it("jumps to deleted Korean text and does not invent a target for absent groups", () => {
  const rows = [
    { kind: "equal", beforeFrom: 0, afterFrom: 0 },
    { kind: "delete", beforeFrom: 8, afterFrom: null },
  ] as ReviewRow[];
  expect(groupJumpSelection(projection, rows, "second")).toEqual({
    side: "before",
    from: 8,
    to: 8,
  });
  expect(groupJumpSelection(projection, rows, "missing")).toBeNull();
  expect(groupJumpSelection(projection, [], "first")).toBeNull();
});
it("does not select a group for unchanged context or a range spanning groups", () => {
  expect(
    groupAtSelection(projection, { side: "before", from: 0, to: 2 }),
  ).toBeUndefined();
  expect(
    groupAtSelection(projection, { side: "after", from: 3, to: 11 }),
  ).toBeUndefined();
});

it("marks only changed rows and preserves the selected group's Korean heading", () => {
  const review = {
    ...projection,
    groups: projection.groups.map((group) => ({
      ...group,
      proposals: [{ id: group.id }],
    })),
    batch: {
      proposals: projection.groups.map((group) => ({
        id: group.id,
        operation: { headingPath: ["여행", group.id] },
      })),
    },
  } as ReviewProjection;
  const rows = [
    { key: "context", kind: "equal", beforeFrom: 0, afterFrom: 0 },
    { key: "deleted", kind: "delete", beforeFrom: 3, afterFrom: null },
    { key: "inserted", kind: "insert", beforeFrom: null, afterFrom: 8 },
  ] as ReviewRow[];
  const marks = groupRowMarks(review, rows, "second");
  expect(marks.has("context")).toBe(false);
  expect(marks.get("deleted")).toEqual({
    id: "first",
    title: "first",
    selected: false,
  });
  expect(marks.get("inserted")).toEqual({
    id: "second",
    title: "second",
    selected: true,
  });
});
