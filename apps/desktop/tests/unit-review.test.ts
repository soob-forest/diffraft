import { expect, it } from "vitest";
import { decodeDraft } from "../src/drafts/decode";
import { projectionOverlaps } from "../src/editor/source-overlaps";
import { reviewPresentation } from "../src/review/presentation";
import { selectedRequestTarget } from "../src/review/selection-targets";
import { confirmationFingerprint } from "../src/review/state";
import {
  adjacentUnit,
  filteredUnits,
  initialUnitView,
  nextPendingUnit,
  normalizeUnitView,
  reopenedUnitView,
  reopenSelectionState,
  repeatedDecisionKey,
  unitCounts,
  unitDecision,
  unitReferences,
} from "../src/review/unit-review-model";
import { repeatedDecisionPointer } from "../src/review/useDecisionPointerGuard";
import { projection, proposal } from "./support/review-projection";

function fixture() {
  const view = projection([
    proposal({ id: "a", groupId: "one", decision: "ACCEPTED" }),
    proposal({ id: "b", groupId: "two", decision: "REJECTED" }),
    proposal({ id: "c", groupId: "three" }),
    proposal({ id: "d", groupId: "three" }),
  ]);
  view.batch.mode = "REWRITE";
  view.batch.reviewMode = "CHANGES";
  view.batch.reviewPlan = {
    id: "plan",
    baseVersionId: "head1",
    candidateHash: "hash",
    algorithmVersion: 1,
  };
  view.batch.reviewUnits = ["one", "two", "three"].map((id, index) => ({
    id,
    planId: "plan",
    number: index + 1,
    title: "동일 제목",
    kind: "modify",
    reason: "변경",
    reviewRevision: 1,
    proposals: view.batch.proposals
      .filter((p) => p.groupId === id)
      .map(({ id, revision }) => ({ id, revision })),
  }));
  return view;
}
it("blocks held approval keys without blocking a fresh press or navigation", () => {
  expect(repeatedDecisionKey("Enter", true)).toBe(true);
  expect(repeatedDecisionKey(" ", true)).toBe(true);
  expect(repeatedDecisionKey("Enter", false)).toBe(false);
  expect(repeatedDecisionKey("F7", true)).toBe(false);
});
it("blocks same-position rapid clicks even when WebKit resets click detail", () => {
  const previous = { timeStamp: 1000, clientX: 20, clientY: 40 };
  expect(
    repeatedDecisionPointer(previous, { ...previous, timeStamp: 1100 }),
  ).toBe(true);
  expect(
    repeatedDecisionPointer(previous, { ...previous, timeStamp: 1600 }),
  ).toBe(false);
  expect(repeatedDecisionPointer(previous, { ...previous, clientX: 30 })).toBe(
    false,
  );
  expect(repeatedDecisionPointer(null, previous)).toBe(false);
});
it("finishes unit review without showing a permanent whole-candidate state", () => {
  const value = fixture();
  value.batch.proposals.forEach((p) => {
    if (p.decision === "PENDING") p.decision = "REJECTED";
  });
  value.groups = [];
  expect(reviewPresentation(value).kind).toBe("completed");
});
it("finds confirmed overlaps in rewrite changes and blocks candidate mutation", () => {
  const value = projection();
  value.batch.mode = "REWRITE";
  value.batch.reviewMode = "CHANGES";
  value.batch.candidateMarkdown = value.after;
  value.groups[0].beforeRanges = [{ from: 0, to: 6 }];
  expect(
    projectionOverlaps(value, {
      kind: "confirmed",
      documentId: "document1",
      expectedHeadId: "head1",
      candidate: value.before,
      title: "원문",
      selection: { taskId: "task1", fromUtf16: 0, toUtf16: 1, quote: "원" },
    }),
  ).toHaveLength(1);
  expect(() =>
    selectedRequestTarget(value, { side: "after", from: 0, to: 1 }),
  ).toThrow(/변경별/);
});
it("counts decisions by stable unit rather than internal operation count", () => {
  const { batch } = fixture();
  expect(unitCounts(batch)).toEqual({ accepted: 1, rejected: 1, pending: 1 });
  expect(nextPendingUnit(batch, "one")?.number).toBe(3);
  expect(nextPendingUnit(batch, "three")).toBeUndefined();
  expect(unitReferences(batch, batch.reviewUnits[2])).toHaveLength(2);
  expect(unitDecision(batch, batch.reviewUnits[1])).toBe("REJECTED");
});
it("invalidates a bulk confirmation when a rejected unit reopens", () => {
  const view = fixture(),
    state = {
      batches: [],
      comments: [],
      unitComments: [],
      sequence: 1,
      generating: false,
    };
  const before = confirmationFingerprint(view, state, false);
  view.batch.reviewUnits[1].reviewRevision++;
  expect(confirmationFingerprint(view, state, false)).not.toBe(before);
});
it("restores unit-wide comments and navigation while isolating malformed payloads", () => {
  const record = (kind: string, value: unknown) => ({
    key: JSON.stringify([kind, "doc", "task", "batch", "plan", "unit"]),
    schemaVersion: 1,
    revision: 1,
    updatedAt: 1,
    valueJson: JSON.stringify(value),
  });
  const comment = { version: 1, id: "request", text: "한글 😀\n의견" };
  expect(decodeDraft(record("unit-comment", comment))).toEqual(comment);
  expect(decodeDraft(record("review-navigation", initialUnitView))).toEqual(
    initialUnitView,
  );
  expect(() =>
    decodeDraft(record("unit-comment", { ...comment, version: 2 })),
  ).toThrow();
  expect(() =>
    decodeDraft(
      record("review-navigation", { ...initialUnitView, filter: "wrong" }),
    ),
  ).toThrow();
});

it("normalizes old navigation drafts to the filter without renumbering units", () => {
  const { batch } = fixture();
  const old = {
    ...initialUnitView,
    selectedId: "two",
    original: true,
    scrollKey: "current",
    originalScrollKey: "original",
  };
  const next = normalizeUnitView(batch, old);
  expect(next).toEqual({ ...old, selectedId: "three", original: false });
  expect(filteredUnits(batch, "pending").map((unit) => unit.number)).toEqual([
    3,
  ]);
  expect(filteredUnits(batch, "processed").map((unit) => unit.number)).toEqual([
    1, 2,
  ]);
  expect(normalizeUnitView(batch, next)).toBe(next);
  expect(old.selectedId).toBe("two");
});
it("preserves an included selection and chooses the first stable number outside a filter", () => {
  const { batch } = fixture();
  const selected = {
    ...initialUnitView,
    filter: "processed" as const,
    selectedId: "two",
    original: false,
  };
  expect(normalizeUnitView(batch, selected)).toBe(selected);
  batch.reviewUnits.reverse();
  expect(
    normalizeUnitView(batch, { ...selected, selectedId: "three" }),
  ).toEqual({ ...selected, selectedId: "one", original: true });
});
it("leaves an empty filter without selection or a fallback navigation target", () => {
  const { batch } = fixture();
  batch.proposals.forEach((proposal) => {
    proposal.decision = "ACCEPTED";
  });
  const value = normalizeUnitView(batch, {
    ...initialUnitView,
    selectedId: "three",
    original: true,
  });
  expect(value.selectedId).toBe("");
  expect(value.original).toBe(false);
  expect(
    adjacentUnit(filteredUnits(batch, value.filter), "three", 1),
  ).toBeUndefined();
});
it("wraps only inside the filter and keeps a single result", () => {
  const { batch } = fixture();
  const pending = filteredUnits(batch, "pending"),
    processed = filteredUnits(batch, "processed");
  expect(adjacentUnit(pending, "three", -1)?.id).toBe("three");
  expect(adjacentUnit(processed, "two", 1)?.id).toBe("one");
  expect(adjacentUnit(processed, "one", -1)?.id).toBe("two");
  expect(adjacentUnit(processed, "unknown", -1)?.id).toBe("one");
});
it("waits for the reopened revision before selecting its pending unit", () => {
  const { batch } = fixture();
  const rejected = { ...batch.reviewUnits[1] };
  expect(reopenedUnitView(batch, rejected)).toBeNull();
  batch.reviewUnits[1].reviewRevision++;
  expect(reopenedUnitView(batch, rejected)).toBeNull();
  for (const proposal of batch.proposals)
    if (proposal.groupId === rejected.id) proposal.decision = "PENDING";
  expect(reopenedUnitView(batch, rejected)).toMatchObject({
    selectedId: rejected.id,
    filter: "pending",
    original: false,
  });
});
it("cancels a reopened selection intent when another window has already processed it", () => {
  const { batch } = fixture();
  const intent = { ...batch.reviewUnits[1] };
  expect(reopenSelectionState(batch, intent)).toBe("waiting");
  batch.reviewUnits[1].reviewRevision++;
  expect(reopenSelectionState(batch, intent)).toBe("changed");
  batch.reviewUnits = [];
  expect(reopenSelectionState(batch, intent)).toBe("changed");
});
