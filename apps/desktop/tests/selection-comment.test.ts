import { expect, it } from "vitest";
import { selectedCommentProposal } from "../src/review/selection-comment";
import { projection, proposal } from "./support/review-projection";

it("maps a quote to its individual proposal and rejects cross-proposal or archived quotes", () => {
  const value = projection([
    proposal(),
    proposal({ id: "second", groupId: "second" }),
  ]);
  value.after = "가나다라";
  value.groups[0].afterRanges = [{ from: 0, to: 6 }];
  value.groups[1].afterRanges = [{ from: 6, to: 12 }];
  expect(
    selectedCommentProposal(value, { side: "after", from: 2, to: 4 }),
  ).toBe("second");
  expect(
    selectedCommentProposal(value, { side: "after", from: 1, to: 3 }),
  ).toBeNull();
  value.batch.status = "ARCHIVED";
  expect(
    selectedCommentProposal(value, { side: "after", from: 2, to: 4 }),
  ).toBeNull();
});
