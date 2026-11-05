import { draftError } from "../drafts/validation";
import { errorMessage } from "../ipc";

export type UnitCommentDraft = { version: 1; id: string; text: string };
export const EMPTY_UNIT_COMMENT: UnitCommentDraft = {
  version: 1,
  id: "",
  text: "",
};
export type CommentSaveStage = "input" | "draft" | "registration";
export type CommentSaveResult = {
  kind: "registered" | "failed";
  stage: CommentSaveStage;
  submitted: UnitCommentDraft;
  message: string;
};
type CommentDraftAccess = {
  value: UnitCommentDraft;
  flush: () => Promise<void>;
  replace: (expected: UnitCommentDraft, next: UnitCommentDraft) => void;
};
type SaveOptions = {
  draft: CommentDraftAccess;
  register: (submitted: UnitCommentDraft) => Promise<void>;
  onStage: (stage: CommentSaveStage) => void;
};

export async function saveUnitComment({
  draft,
  register,
  onStage,
}: SaveOptions): Promise<CommentSaveResult> {
  const submitted = draft.value;
  const validation = draftError(submitted.text);
  if (validation)
    return { kind: "failed", stage: "input", submitted, message: validation };
  let stage: CommentSaveStage = "draft";
  try {
    onStage(stage);
    await draft.flush();
    stage = "registration";
    onStage(stage);
    await register(submitted);
    draft.replace(submitted, EMPTY_UNIT_COMMENT);
    return {
      kind: "registered",
      stage,
      submitted,
      message: "코멘트 저장됨. 제안 내용은 그대로입니다.",
    };
  } catch (reason) {
    return { kind: "failed", stage, submitted, message: errorMessage(reason) };
  }
}

export async function storeUnitCommentDraft(
  draft: CommentDraftAccess,
): Promise<CommentSaveResult | null> {
  const submitted = draft.value;
  try {
    await draft.flush();
    return null;
  } catch (reason) {
    return {
      kind: "failed",
      stage: "draft",
      submitted,
      message: errorMessage(reason),
    };
  }
}
