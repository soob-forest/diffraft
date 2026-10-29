import { useRef, useState } from "react";
import { useSessionDraft } from "../drafts/SessionDrafts";
import { draftError } from "../drafts/validation";
import type { Proposal } from "../generated/Proposal";
import type { ReviewProjection } from "../generated/ReviewProjection";
import type { ReviewSide } from "../generated/ReviewSide";
import { errorMessage } from "../ipc";
import { reviewCommand } from "./api";
import { type CommentDraft, validCommentDraft } from "./comment-draft";
import { commentTarget } from "./comment-target";
import type { LogicalSelection } from "./coordinates";

export type CommentFormProps = {
  projection: ReviewProjection;
  proposal: Proposal;
  selection: LogicalSelection | null;
  onSaved: () => void;
  blocked: boolean;
};

export function useCommentForm(props: CommentFormProps) {
  const { draft, empty, sideDraft, side, current, value, target, stale } =
    useCommentDraft(props);
  const setText = (text: string) =>
    draft.set({
      ...value,
      text,
      target,
      id: crypto.randomUUID(),
      revision: value.text ? value.revision : props.proposal.revision,
    });
  const operation = useCommentSave({ props, side, draft, empty });
  return {
    side,
    setSide: sideDraft.set,
    text: value.text,
    setText,
    target,
    stale,
    clear: () => draft.set(empty),
    reconfirm: () =>
      draft.set({
        ...value,
        target: current,
        revision: props.proposal.revision,
        id: crypto.randomUUID(),
      }),
    ...operation,
    save: () =>
      props.blocked || stale || !target.quote || !value.text.trim()
        ? Promise.resolve()
        : operation.save(),
  };
}

function useCommentSave({
  props,
  side,
  draft,
  empty,
}: {
  props: CommentFormProps;
  side: ReviewSide;
  draft: ReturnType<typeof useSessionDraft<CommentDraft>>;
  empty: CommentDraft;
}) {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const save = async () => {
    if (lock.current || props.blocked) return;
    lock.current = true;
    setBusy(true);
    const submitted = draft.value;
    try {
      const error = draftError(submitted.text);
      if (error) throw new Error(error);
      await persistComment(props, side, submitted);
      draft.replace(submitted, empty);
      setMessage(
        "코멘트를 저장했습니다. AI 재제안은 ‘코멘트 반영 재제안 작성’에서 요청해 주세요.",
      );
      props.onSaved();
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  return { save, busy, message };
}

function useCommentDraft(props: CommentFormProps) {
  const { batch } = props.projection;
  const key = [
    "comment",
    batch.documentId,
    batch.taskId,
    batch.id,
    props.proposal.id,
  ];
  const sideDraft = useSessionDraft<ReviewSide>(
    JSON.stringify([...key, "side"]),
    props.selection?.side ?? "after",
  );
  const side = sideDraft.value;
  const current = commentTarget(
    props.projection,
    props.proposal,
    side,
    props.selection,
  );
  const empty: CommentDraft = {
    text: "",
    revision: props.proposal.revision,
    target: current,
    id: "",
  };
  const draft = useSessionDraft(JSON.stringify([...key, side]), empty);
  const value = draft.value;
  const target = value.text ? value.target : current;
  const source =
    side === "before"
      ? props.proposal.operation.before
      : props.proposal.operation.after;
  const stale =
    Boolean(value.text) &&
    !validCommentDraft(value, props.proposal.revision, source);
  return { draft, empty, sideDraft, side, current, value, target, stale };
}

async function persistComment(
  props: CommentFormProps,
  side: ReviewSide,
  submitted: CommentDraft,
) {
  await reviewCommand(
    {
      kind: "add_comment",
      comment: {
        id: submitted.id,
        batchId: props.projection.batch.id,
        proposalId: props.proposal.id,
        expectedRevision: submitted.revision,
        side,
        text: submitted.text,
        fromUtf16: submitted.target.fromUtf16,
        toUtf16: submitted.target.toUtf16,
      },
    },
    "comment",
  );
}
