import { expect, it } from "vitest";
import { invalidationReason } from "../src/review/invalidation";
import { projection } from "./support/review-projection";

const version = (id: string, number: number, reason: string) => ({
  id,
  number,
  reason,
  contentHash: "hash",
  createdAt: 0,
});
it("identifies the first saved change after the batch head rather than the latest edit", () => {
  const p = projection();
  p.currentHeadId = "head14";
  const versions = [
    version("head14", 14, "edit"),
    version("head13", 13, "restore"),
    version(p.batch.applyHeadId, 12, "accept"),
  ];
  expect(invalidationReason(p, versions)).toContain("복원");
});
it("does not invent a cause without an adjacent saved version or a changed head", () => {
  const p = projection();
  expect(invalidationReason(p, [])).toBeNull();
  p.currentHeadId = "head14";
  expect(
    invalidationReason(p, [
      version(p.batch.applyHeadId, 12, "accept"),
      version("head14", 14, "edit"),
    ]),
  ).toBeNull();
});
