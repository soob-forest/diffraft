import { expect, it } from "vitest";
import { projectionOverlaps } from "../src/editor/source-overlaps";
import type { SelectedTarget } from "../src/review/selection-targets";
import { projection } from "./support/review-projection";

it("finds exact raw UTF-16 overlap and excludes disjoint, stale, and archived proposals", () => {
  const value = projection();
  value.before = "한글😀원문";
  value.groups[0].beforeRanges = [{ from: 6, to: 10 }];
  const target: SelectedTarget = {
    kind: "confirmed",
    documentId: "document1",
    expectedHeadId: "head1",
    candidate: value.before,
    title: "원문",
    selection: { taskId: "task1", fromUtf16: 2, toUtf16: 4, quote: "😀" },
  };
  expect(projectionOverlaps(value, target)).toEqual([
    { id: "proposal1", revision: 1 },
  ]);
  expect(
    projectionOverlaps(value, {
      ...target,
      selection: {
        ...target.selection,
        fromUtf16: 4,
        toUtf16: 6,
        quote: "원문",
      },
    }),
  ).toEqual([]);
  expect(
    projectionOverlaps(value, { ...target, expectedHeadId: "old" }),
  ).toEqual([]);
  value.batch.status = "ARCHIVED";
  expect(projectionOverlaps(value, target)).toEqual([]);
});
