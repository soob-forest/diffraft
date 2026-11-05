import { expect, it } from "vitest";
import { unitLocation } from "../src/review/unit-review-location";
import { projection } from "./support/review-projection";

function fixture() {
  const value = projection();
  value.before = "그대로\n원문\n문맥\n둘째\n";
  value.after = "그대로\n후보\n문맥\n둘 수정\n";
  const bytes = (text: string) => new TextEncoder().encode(text).length;
  value.groups[0].beforeRanges = [
    { from: 0, to: bytes("그대로\n원문\n") },
    { from: bytes("그대로\n원문\n"), to: bytes(value.before) },
  ];
  value.groups[0].afterRanges = [
    { from: 0, to: bytes("그대로\n후보\n") },
    { from: bytes("그대로\n후보\n"), to: bytes(value.after) },
  ];
  const line = (
    kind: string,
    oldLine: number | null,
    newLine: number | null,
    text: string,
  ) => ({
    kind,
    oldLine,
    newLine,
    segments: [{ text, changed: kind !== "equal" }],
  });
  value.hunks = [
    {
      oldRange: { from: 0, to: bytes(value.before) },
      newRange: { from: 0, to: bytes(value.after) },
      groupIds: [value.groups[0].id],
      lines: [
        line("equal", 1, 1, "그대로\n"),
        line("delete", 2, null, "원문\n"),
        line("insert", null, 2, "후보\n"),
        line("equal", 3, 3, "문맥\n"),
        line("delete", 4, null, "둘째\n"),
        line("insert", null, 4, "둘 수정\n"),
      ],
    },
  ];
  return value;
}
it("jumps to changed text inside a whole paragraph instead of unchanged leading context", () => {
  const value = fixture();
  expect(unitLocation(value, value.groups[0].id, 0)).toEqual({
    side: "before",
    from: 4,
    to: 4,
  });
});
it("chooses the changed row in the requested related range", () => {
  const value = fixture();
  const from = "그대로\n원문\n문맥\n".length;
  expect(unitLocation(value, value.groups[0].id, 1)).toEqual({
    side: "before",
    from,
    to: from,
  });
});
it("does not invent an unchanged or missing target", () => {
  const value = fixture();
  expect(unitLocation(value, "missing", 0)).toBeNull();
  expect(unitLocation(value, value.groups[0].id, -1)).toBeNull();
  expect(unitLocation(value, value.groups[0].id, 9)).toBeNull();
  value.hunks = [];
  value.after = value.before;
  expect(unitLocation(value, value.groups[0].id, 0)).toBeNull();
});
