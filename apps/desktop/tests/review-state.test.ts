import { describe, expect, it } from "vitest";
import type { ReviewProjection } from "../src/generated/ReviewProjection";
import {
  displayRows,
  displaySelection,
  logicalSelection,
} from "../src/review/coordinates";
import { type ReviewRow, splitRows } from "../src/review/rows";
import {
  confirmationFingerprint,
  ReadSequence,
  reviewFingerprint,
} from "../src/review/state";
import { projection as fixture } from "./support/review-projection";

const row = (kind: string, from: number): ReviewRow => ({
  kind,
  oldLine: kind === "insert" ? null : 1,
  newLine: kind === "delete" ? null : 1,
  raw: "한😀글\r\n",
  segments: [],
  beforeFrom: kind === "insert" ? null : from,
  afterFrom: kind === "delete" ? null : from,
  key: kind,
  folded: 0,
});
describe("review UI coordinates and ordering", () => {
  it("preserves a Unicode selection and its original side between inline and split", () => {
    const rows = [row("delete", 10), row("insert", 10)];
    const inline = displayRows(rows);
    const logical = logicalSelection(inline, { from: 1, to: 3 }, "inline");
    expect(logical).toEqual({ side: "before", from: 11, to: 13 });
    const split = displayRows(splitRows(rows).map((r) => r.before));
    if (!logical) throw new Error("선택 범위가 없습니다.");
    expect(displaySelection(split, logical)).toEqual({ anchor: 1, head: 3 });
    expect(logicalSelection(inline, { from: 1, to: 8 }, "inline")).toBeNull();
  });
  it("discards responses that arrive after a new read or unmount", () => {
    const reads = new ReadSequence();
    const old = reads.begin();
    const current = reads.begin();
    expect(reads.current(old)).toBe(false);
    expect(reads.current(current)).toBe(true);
    reads.invalidate();
    expect(reads.current(current)).toBe(false);
  });
  it("invalidates confirmations for revision, head or generation changes, not projection IDs", () => {
    const projection: ReviewProjection = {
      ...fixture(),
      id: "view1",
      currentHeadId: "v12",
      batch: {
        ...fixture().batch,
        id: "B01",
        status: "ACTIVE",
        reviewMode: "CHANGES",
        reviewPlan: null,
        reviewUnits: [],
        proposals: [
          {
            ...fixture().batch.proposals[0],
            id: "D01",
            revision: 1,
            groupId: "G01",
            decision: "PENDING",
            validity: "VALID",
          },
        ],
      },
    };
    expect(reviewFingerprint({ ...projection, id: "view2" })).toBe(
      reviewFingerprint(projection),
    );
    const state = {
      generating: false,
      batches: [],
      comments: [],
      unitComments: [],
      sequence: 1,
    };
    const fingerprint = confirmationFingerprint(projection, state, false);
    expect(
      confirmationFingerprint(
        projection,
        { ...state, generating: true },
        false,
      ),
    ).not.toBe(fingerprint);
    expect(
      confirmationFingerprint(
        { ...projection, currentHeadId: "v13" },
        state,
        false,
      ),
    ).not.toBe(fingerprint);
    const changed = structuredClone(projection);
    const regrouped = structuredClone(projection);
    regrouped.batch.patchReview = {
      policyVersion: 1,
      revision: 2,
      reasons: {},
    };
    expect(confirmationFingerprint(regrouped, state, false)).not.toBe(
      fingerprint,
    );
    changed.batch.proposals[0].revision++;
    expect(confirmationFingerprint(changed, state, false)).not.toBe(
      fingerprint,
    );
  });
});
