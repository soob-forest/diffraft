import type { DraftStorageState } from "../drafts/acknowledgements";
import {
  type CommentSaveResult,
  type CommentSaveStage,
  EMPTY_UNIT_COMMENT,
  type UnitCommentDraft,
} from "./unit-comment-save";

type FeedbackInput = {
  value: UnitCommentDraft;
  storage: DraftStorageState;
  busy: boolean;
  stage: CommentSaveStage;
  result: CommentSaveResult | null;
};
export function unitCommentFeedback(input: FeedbackInput) {
  const { value, storage, busy, stage } = input;
  const result = matchingResult(input);
  const storageMessage = storageSummary(storage, result?.message);
  const retryDraft =
    !busy && needsDraftRetry(storage, result, Boolean(value.text));
  const actions = {
    retryDraft,
    retryRegistration:
      result?.kind === "failed" && result.stage === "registration",
  };
  if (busy)
    return {
      ...actions,
      message: `${stage === "registration" ? "코멘트 등록 중…" : "코멘트 등록 전 초안 보관 중…"} ${storageMessage}`,
    };
  if (result?.kind === "registered")
    return {
      ...actions,
      message: registeredMessage(result, storage),
    };
  if (result?.kind === "failed")
    return {
      ...actions,
      message: `${failurePrefix(result.stage)}${result.message} ${storageMessage}`,
    };
  return {
    ...actions,
    message:
      value.text || storage.kind === "locked"
        ? `코멘트 미등록 · ${storageMessage}`
        : "등록할 의견을 입력해 주세요.",
  };
}
function registeredMessage(
  result: CommentSaveResult,
  storage: DraftStorageState,
) {
  if (storage.kind !== "failed") return result.message;
  return `${result.message} 입력 비움 상태의 기기 보관을 확인하지 못했습니다. ${storage.message ?? "초안 보관을 다시 시도해 주세요."}`;
}

function needsDraftRetry(
  storage: DraftStorageState,
  result: CommentSaveResult | null,
  hasInput: boolean,
) {
  if (storage.kind === "locked") return false;
  if (storage.kind === "unknown") return hasInput;
  if (storage.kind === "failed") return true;
  if (storage.kind === "pending" && storage.message) return true;
  return result?.kind === "failed" && result.stage === "draft";
}

function matchingResult({ value, result }: FeedbackInput) {
  return result?.submitted === value ||
    (result?.kind === "registered" && value === EMPTY_UNIT_COMMENT)
    ? result
    : null;
}
function failurePrefix(stage: CommentSaveStage) {
  if (stage === "input") return "";
  return stage === "draft"
    ? "코멘트를 등록하지 않았습니다. 등록 전 초안 보관 과정 오류: "
    : "코멘트 등록을 확인하지 못했습니다. ";
}
function storageSummary(storage: DraftStorageState, shownError?: string) {
  const reason = storage.message === shownError ? "" : storage.message;
  switch (storage.kind) {
    case "saved":
      return "이 입력의 초안은 기기에 저장됨.";
    case "pending":
      return `이 입력의 초안 보관 대기 중입니다.${reason ? ` 이전 보관 과정 오류: ${reason}` : ""}`;
    case "saving":
      return "이 입력의 초안을 기기에 보관 중입니다.";
    case "failed":
      return `이 입력의 초안 보관을 확인하지 못했습니다. ${reason ?? "초안 보관을 다시 시도해 주세요."}`;
    case "locked":
      return "초안 복원이 보류되어 입력이 잠겼습니다. 아래 초안 복구에서 원본을 확인해 주세요.";
    case "unknown":
      return "이 입력의 기기 보관 여부를 아직 확인하지 못했습니다.";
  }
}
