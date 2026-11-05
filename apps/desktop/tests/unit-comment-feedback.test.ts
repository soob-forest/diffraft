import { expect, it } from "vitest";
import { unitCommentFeedback } from "../src/review/unit-comment-feedback";
import {
  type CommentSaveResult,
  EMPTY_UNIT_COMMENT,
  type UnitCommentDraft,
} from "../src/review/unit-comment-save";

const value: UnitCommentDraft = {
  version: 1,
  id: "submitted",
  text: "opinion",
};
const failed = (stage: CommentSaveResult["stage"]): CommentSaveResult => ({
  kind: "failed",
  stage,
  submitted: value,
  message: "specific failure",
});
const input = { value, busy: false, stage: "draft" as const, result: null };

it("does not promise storage for pending, unknown, failed, or locked input", () => {
  for (const kind of ["pending", "unknown", "failed", "locked"] as const) {
    const feedback = unitCommentFeedback({ ...input, storage: { kind } });
    expect(feedback.message).not.toContain("저장됨");
    expect(feedback.retryDraft).toBe(kind === "failed" || kind === "unknown");
  }
  expect(
    unitCommentFeedback({ ...input, storage: { kind: "saved" } }).message,
  ).toContain("기기에 저장됨");
});

it("separates registration failure from confirmed storage and exposes the matching retry", () => {
  const feedback = unitCommentFeedback({
    ...input,
    storage: { kind: "saved" },
    result: failed("registration"),
  });
  expect(feedback.message).toContain("등록을 확인하지 못했습니다");
  expect(feedback.message).toContain("기기에 저장됨");
  expect(feedback.retryRegistration).toBe(true);
  expect(feedback.retryDraft).toBe(false);
  const beforeRegistration = unitCommentFeedback({
    ...input,
    storage: { kind: "saved" },
    result: failed("draft"),
  });
  expect(beforeRegistration.message).toContain("등록하지 않았습니다");
  expect(beforeRegistration.retryDraft).toBe(true);
  expect(beforeRegistration.retryRegistration).toBe(false);
});

it("does not attribute an older submission result to newer input", () => {
  const registered: CommentSaveResult = {
    ...failed("registration"),
    kind: "registered",
    message: "registered successfully",
  };
  for (const result of [failed("registration"), registered]) {
    const feedback = unitCommentFeedback({
      ...input,
      value: { ...value, id: "new", text: "new input" },
      storage: { kind: "pending" },
      result,
    });
    expect(feedback.message).not.toContain(result.message);
    expect(feedback.retryRegistration).toBe(false);
  }
  expect(
    unitCommentFeedback({
      ...input,
      value: EMPTY_UNIT_COMMENT,
      storage: { kind: "pending" },
      result: registered,
    }).message,
  ).toBe("registered successfully");
});

it("keeps registration and draft preparation distinct while busy", () => {
  const preparing = unitCommentFeedback({
    ...input,
    busy: true,
    storage: { kind: "saving" },
  });
  const registering = unitCommentFeedback({
    ...input,
    busy: true,
    stage: "registration",
    storage: { kind: "saved" },
  });
  expect(preparing.message).toContain("등록 전 초안 보관 중");
  expect(registering.message).toContain("코멘트 등록 중");
  expect(registering.message).toContain("기기에 저장됨");
  expect(registering.retryDraft).toBe(false);
});

it("retains registration success while exposing a failed draft-clear recovery", () => {
  const feedback = unitCommentFeedback({
    ...input,
    value: EMPTY_UNIT_COMMENT,
    storage: { kind: "failed", message: "clear failed" },
    result: {
      ...failed("registration"),
      kind: "registered",
      message: "registered",
    },
  });
  expect(feedback.message).toContain("registered");
  expect(feedback.message).toContain(
    "입력 비움 상태의 기기 보관을 확인하지 못했습니다",
  );
  expect(feedback.retryDraft).toBe(true);
  expect(feedback.retryRegistration).toBe(false);
  expect(
    unitCommentFeedback({
      ...input,
      value: EMPTY_UNIT_COMMENT,
      storage: { kind: "unknown" },
    }).retryDraft,
  ).toBe(false);
});
