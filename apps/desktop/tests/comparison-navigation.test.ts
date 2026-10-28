import { describe, expect, it } from "vitest";
import { comparisonJump } from "../src/review/comparison-navigation";
import type { DiffComparison } from "../src/review/rows";

const comparison: DiffComparison = {
  before: "\ufeff한😀\r\n바뀔 줄\r\n",
  after: "\ufeff한😀\r\n새 줄\r\n",
  hunks: [
    {
      oldRange: { from: 0, to: 24 },
      newRange: { from: 0, to: 21 },
      groupIds: [],
      lines: [
        { kind: "equal", oldLine: 1, newLine: 1, segments: [] },
        { kind: "delete", oldLine: 2, newLine: null, segments: [] },
        { kind: "insert", oldLine: null, newLine: 2, segments: [] },
      ],
    },
  ],
};
describe("comparison navigation", () => {
  it("starts previous at the last hunk and wraps next at the first", () => {
    const many = { ...comparison, hunks: Array(3).fill(comparison.hunks[0]) };
    expect(comparisonJump(many, -1, -1)?.position).toBe(2);
    expect(comparisonJump(many, -1, 1)?.position).toBe(0);
    expect(comparisonJump(many, 2, 1)?.position).toBe(0);
  });
  it("targets the first changed line with a caret that excludes context and line endings", () => {
    expect(comparisonJump(comparison, -1, 1)?.selection).toEqual({
      side: "before",
      from: 6,
      to: 6,
    });
  });
  it("targets insertion-only hunks in the after pane and handles empty comparisons", () => {
    const inserted = {
      ...comparison,
      before: "",
      hunks: [
        {
          ...comparison.hunks[0],
          oldRange: { from: 0, to: 0 },
          lines: [{ kind: "insert", oldLine: null, newLine: 1, segments: [] }],
        },
      ],
    };
    expect(comparisonJump(inserted, -1, 1)?.selection).toEqual({
      side: "after",
      from: 0,
      to: 0,
    });
    expect(
      comparisonJump({ before: "", after: "", hunks: [] }, -1, 1),
    ).toBeNull();
  });
});
