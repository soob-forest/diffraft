import { expect, it } from "vitest";
import { reviewPresentation } from "../src/review/presentation";
import { projection, proposal } from "./support/review-projection";

it("derives completion from decisions, never from the AI summary or just zero groups", () => {
  const value = projection([
    proposal({ decision: "ACCEPTED" }),
    proposal({ id: "p2", decision: "REJECTED" }),
  ]);
  expect(reviewPresentation(value)).toMatchObject({
    kind: "completed",
    accepted: 1,
    rejected: 1,
  });
  const stale = projection([proposal({ validity: "STALE" })]);
  expect(reviewPresentation(stale).kind).toBe("stale");
  expect(reviewPresentation(projection([])).kind).toBe("unchanged");
});

it("keeps historical, discarded, rewrite and conflict states separate", () => {
  const value = projection();
  value.batch.status = "ARCHIVED";
  expect(reviewPresentation(value).kind).toBe("history");
  value.batch.status = "DISCARDED";
  expect(reviewPresentation(value).kind).toBe("discarded");
  value.batch.status = "ACTIVE";
  value.batch.mode = "REWRITE";
  expect(reviewPresentation(value).kind).toBe("rewrite");
  value.currentHeadId = "head2";
  expect(reviewPresentation(value).kind).toBe("stale");
  expect(
    reviewPresentation(projection([proposal({ validity: "CONFLICT" })])).kind,
  ).toBe("conflict");
});

it("keeps generation and missing result explicit", () => {
  expect(reviewPresentation(null).kind).toBe("empty");
  expect(reviewPresentation(projection(), true).kind).toBe("generating");
});
