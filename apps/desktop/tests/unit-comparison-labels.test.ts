import { expect, it } from "vitest";
import type { VersionSummary } from "../src/generated/VersionSummary";
import { unitComparisonLabels } from "../src/review/unit-comparison-labels";
import { projection } from "./support/review-projection";

const versions: VersionSummary[] = [
  {
    id: "head1",
    number: 14,
    reason: "open",
    createdAt: 0,
    contentHash: "base",
  },
  {
    id: "head2",
    number: 15,
    reason: "proposal",
    createdAt: 0,
    contentHash: "current",
  },
];
it("labels the current projection head rather than the document's newest version", () => {
  const view = projection();
  view.currentHeadId = "head2";
  expect(unitComparisonLabels(view, versions, false)).toEqual([
    "현재 확정본 · v15",
    "제안 반영 예상본 · 미승인 포함",
  ]);
  view.currentHeadId = "head1";
  expect(unitComparisonLabels(view, versions, false)[0]).toBe(
    "현재 확정본 · v14",
  );
});
it("uses the base version for original and inactive comparisons", () => {
  const view = projection();
  view.currentHeadId = "head2";
  expect(unitComparisonLabels(view, versions, true)).toEqual([
    "당시 기준본 · v14",
    "원래 전체 후보 · 읽기 전용",
  ]);
  view.batch.status = "ARCHIVED";
  expect(unitComparisonLabels(view, versions, false)).toEqual(
    unitComparisonLabels(view, versions, true),
  );
});
it("shows an explicit unknown version without borrowing the current version", () => {
  const view = projection();
  view.batch.baseVersionId = "missing";
  expect(unitComparisonLabels(view, versions, true)[0]).toBe(
    "당시 기준본 · 버전 미상 · 확인 필요",
  );
  view.currentHeadId = "missing";
  expect(unitComparisonLabels(view, versions, false)[0]).toBe(
    "현재 확정본 · 버전 미상 · 확인 필요",
  );
});
