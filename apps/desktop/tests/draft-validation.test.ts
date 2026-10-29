import { expect, it } from "vitest";
import { draftError, MAX_DRAFT_BYTES } from "../src/drafts/validation";

it("validates bytes rather than character count without truncating Unicode drafts", () => {
  expect(draftError(" ")).not.toBe("");
  expect(draftError("text\0")).not.toBe("");
  expect(draftError("a".repeat(MAX_DRAFT_BYTES))).toBe("");
  expect(draftError("한".repeat(Math.floor(MAX_DRAFT_BYTES / 3) + 1))).not.toBe(
    "",
  );
  expect(draftError("한글 😀")).toBe("");
});
