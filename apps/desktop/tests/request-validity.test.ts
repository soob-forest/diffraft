import { expect, it } from "vitest";
import { pendingReviewChanged } from "../src/generation/request-validity";

const pending = {
  reviewSequence: 5,
  request: { expectedActiveBatchId: "new" },
} as never;
it("ignores a poll older than the confirmed snapshot and invalidates a newer change", () => {
  expect(pendingReviewChanged(pending, 4, null)).toBe(false);
  expect(pendingReviewChanged(pending, 5, "new")).toBe(false);
  expect(pendingReviewChanged(pending, 6, "other")).toBe(true);
  expect(pendingReviewChanged(pending, 6, "new")).toBe(true);
});
