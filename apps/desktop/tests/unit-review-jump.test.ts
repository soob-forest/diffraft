import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { UnitReviewDiff } from "../src/review/UnitReviewDiff";
import {
  type UnitJump,
  unitComparisonJump,
} from "../src/review/unit-review-jump";
import { initialUnitView } from "../src/review/unit-review-model";
import type { UnitNavigation } from "../src/review/useUnitNavigation";
import { projection } from "./support/review-projection";

const comparisons = vi.hoisted(() => [] as { jump: UnitJump | null }[]);
vi.mock("../src/review/DiffViewer", () => ({
  DiffViewer: (props: { jump: UnitJump | null }) => {
    comparisons.push(props);
    return null;
  },
}));

const current: UnitJump = {
  selection: { side: "before", from: 12, to: 12 },
  serial: 1,
  focus: true,
  revealGroupHeading: true,
  scope: "current",
};
const original: UnitJump = {
  ...current,
  selection: { side: "before", from: 40, to: 40 },
  serial: 2,
  focus: false,
  scope: "original",
};

it("does not apply a current jump when opening the original comparison", () => {
  expect(unitComparisonJump(current, "current", true)).toBe(current);
  expect(unitComparisonJump(current, "original", true)).toBeNull();
});
it("does not replay original coordinates or focus after returning to current", () => {
  expect(unitComparisonJump(original, "original", true)).toBe(original);
  expect(unitComparisonJump(original, "current", true)).toBeNull();
  expect(original.focus).toBe(false);
  expect(original.selection.from).toBe(40);
});
it("keeps hidden comparisons inert and accepts no pending jump", () => {
  expect(unitComparisonJump(current, "current", false)).toBeNull();
  expect(unitComparisonJump(original, "original", false)).toBeNull();
  expect(unitComparisonJump(null, "current", true)).toBeNull();
});
it("passes no original jump to the current DiffViewer after comparison return", () => {
  comparisons.length = 0;
  const navigation = {
    value: initialUnitView,
    jump: original,
    selected: undefined,
  } as unknown as UnitNavigation;
  renderToStaticMarkup(
    createElement(UnitReviewDiff, {
      projection: projection(),
      navigation,
      active: true,
      versions: [],
    }),
  );
  expect(comparisons).toHaveLength(1);
  expect(comparisons[0].jump).toBeNull();
});
