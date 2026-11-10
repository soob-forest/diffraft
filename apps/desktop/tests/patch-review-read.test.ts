import { beforeEach, expect, it, vi } from "vitest";
import type { BatchSummary } from "../src/generated/BatchSummary";
import { reviewCommand } from "../src/review/api";
import { readReviewProjection } from "../src/review/patch-review-read";

vi.mock("../src/review/api", () => ({ reviewCommand: vi.fn() }));
const command = vi.mocked(reviewCommand);
const batch: BatchSummary = {
  id: "batch",
  baseVersionId: "head",
  mode: "PATCH",
  reviewMode: "CHANGES",
  status: "ACTIVE",
  summary: "fixture",
};
beforeEach(() => {
  command.mockReset();
});

it("prepares legacy groups before reading a projection", async () => {
  command
    .mockResolvedValueOnce({} as never)
    .mockResolvedValueOnce({ id: "projection" } as never);
  await expect(
    readReviewProjection(batch, "document", "head", false),
  ).resolves.toEqual({ id: "projection" });
  expect(command.mock.calls.map(([action]) => action.kind)).toEqual([
    "prepare_patch_review",
    "projection",
  ]);
  expect(command.mock.calls[0][0]).toMatchObject({
    request: {
      documentId: "document",
      batchId: "batch",
      expectedHeadId: "head",
    },
  });
});

it("does not expose an unprepared projection when preparation fails", async () => {
  command.mockRejectedValueOnce(new Error("preparation failed"));
  await expect(
    readReviewProjection(batch, "document", "head", false),
  ).rejects.toThrow("preparation failed");
  expect(command).toHaveBeenCalledTimes(1);
});

it.each([
  [batch, "", false],
  [batch, "document", true],
  [{ ...batch, mode: "REWRITE" }, "document", false],
  [{ ...batch, status: "ARCHIVED" }, "document", false],
])(
  "keeps background, generation and historical reads free of preparation",
  async (selected, documentId, generating) => {
    command.mockResolvedValueOnce({} as never);
    await readReviewProjection(selected, documentId, "head", generating);
    expect(command.mock.calls.map(([action]) => action.kind)).toEqual([
      "projection",
    ]);
  },
);
