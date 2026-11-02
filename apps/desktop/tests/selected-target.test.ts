import { expect, it } from "vitest";
import { selectedCandidateTarget } from "../src/review/selected-target";
import { projection, proposal } from "./support/review-projection";

it("converts a projected range into exact candidate-local Unicode offsets", () => {
  const value = projection([proposal()]);
  value.after = "앞 문맥 새😀후보 새😀후보 뒤";
  value.batch.proposals[0].operation.after = "새😀후보 새😀후보";
  const from = "앞 문맥 ".length;
  value.groups[0].afterRanges = [
    {
      from: new TextEncoder().encode(value.after.slice(0, from)).length,
      to: new TextEncoder().encode(value.after.slice(0, -2)).length,
    },
  ];
  const target = selectedCandidateTarget(value, {
    side: "after",
    from: from + 6,
    to: from + 11,
  });
  expect(target.selection).toMatchObject({
    fromUtf16: 6,
    toUtf16: 11,
    quote: "새😀후보",
  });
});
it("rejects before, mixed targets, missing and stale selections instead of using a whole proposal", () => {
  const value = projection();
  expect(() => selectedCandidateTarget(value, null)).toThrow();
  expect(() =>
    selectedCandidateTarget(value, { side: "before", from: 0, to: 1 }),
  ).toThrow(/제안 쪽/);
  expect(() =>
    selectedCandidateTarget(value, { side: "after", from: 0, to: 99 }),
  ).toThrow();
  value.batch.status = "ARCHIVED";
  expect(() =>
    selectedCandidateTarget(value, { side: "after", from: 0, to: 1 }),
  ).toThrow(/읽기/);
});
