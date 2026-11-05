import { useEffect, useRef, useState } from "react";
import { useSessionDraft } from "../drafts/SessionDrafts";
import type { ReviewBatch } from "../generated/ReviewBatch";
import type { ReviewUnit } from "../generated/ReviewUnit";
import { reviewCommand } from "./api";
import { unitCommentFeedback } from "./unit-comment-feedback";
import {
  type CommentSaveResult,
  type CommentSaveStage,
  EMPTY_UNIT_COMMENT,
  saveUnitComment,
  storeUnitCommentDraft,
  type UnitCommentDraft,
} from "./unit-comment-save";

export function useUnitComment(
  batch: ReviewBatch,
  unit: ReviewUnit,
  onSaved: () => void,
) {
  const draft = useUnitCommentDraft(batch, unit);
  const operation = useCommentSubmission(
    draft,
    (submitted) => persistUnitComment(batch, unit, submitted),
    onSaved,
  );
  return {
    draft,
    ...operation,
    feedback: unitCommentFeedback({
      value: draft.value,
      storage: draft.storage,
      ...operation,
    }),
    setText: (text: string) =>
      draft.set({ version: 1, id: crypto.randomUUID(), text }),
  };
}

type SubmissionState = {
  busy: boolean;
  stage: CommentSaveStage;
  result: CommentSaveResult | null;
};
function useCommentSubmission(
  draft: ReturnType<typeof useUnitCommentDraft>,
  register: (submitted: UnitCommentDraft) => Promise<void>,
  onSaved: () => void,
) {
  const [state, setState] = useState<SubmissionState>({
    busy: false,
    stage: "draft",
    result: null,
  });
  const lock = useRef(false),
    active = useCommentMounted();
  const update = (change: Partial<SubmissionState>) => {
    if (active.current) setState((current) => ({ ...current, ...change }));
  };
  const run = async (registerComment: boolean) => {
    if (lock.current || draft.locked) return;
    lock.current = true;
    update({ busy: true, stage: "draft", result: null });
    try {
      const result = registerComment
        ? await saveUnitComment({
            draft,
            register,
            onStage: (stage) => update({ stage }),
          })
        : await storeUnitCommentDraft(draft);
      update({ result });
      if (result?.kind === "registered" && active.current) onSaved();
      return result;
    } finally {
      lock.current = false;
      update({ busy: false });
    }
  };
  return { ...state, save: () => run(true), retryDraft: () => run(false) };
}

function useUnitCommentDraft(batch: ReviewBatch, unit: ReviewUnit) {
  const key = JSON.stringify([
    "unit-comment",
    batch.documentId,
    batch.taskId,
    batch.id,
    unit.planId,
    unit.id,
  ]);
  return useSessionDraft<UnitCommentDraft>(key, EMPTY_UNIT_COMMENT);
}

async function persistUnitComment(
  batch: ReviewBatch,
  unit: ReviewUnit,
  submitted: UnitCommentDraft,
) {
  await reviewCommand(
    {
      kind: "add_unit_comment",
      comment: {
        id: submitted.id,
        batchId: batch.id,
        planId: unit.planId,
        unitId: unit.id,
        text: submitted.text,
      },
    },
    "unit_comment",
  );
}

function useCommentMounted() {
  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  return active;
}
