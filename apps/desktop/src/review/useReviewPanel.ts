import { useEffect, useState } from "react";
import type { DocumentModel } from "../editor/useDocument";
import type { ReviewGroup } from "../generated/ReviewGroup";
import type { ReviewProjection } from "../generated/ReviewProjection";
import type { Approval } from "./ApprovalDialog";
import type { LogicalSelection } from "./coordinates";
import { utf16AtByte } from "./rows";
import { confirmationFingerprint } from "./state";
import { useReview } from "./useReview";
import { useReviewActions } from "./useReviewActions";

type Props = {
  document: DocumentModel;
  taskId: string;
  flushTask: () => Promise<void>;
};
export function useReviewPanel(props: Props) {
  const review = useReview(
    props.taskId,
    props.document.autosave.document.versionId,
  );
  const actions = useReviewActions(props.document, review);
  const [approval, setApproval] = useState<Approval | null>(null);
  const [regenerating, setRegenerating] = useState(false);
  const groups = review.projection?.groups ?? [];
  const navigation = useNavigation(review.projection);
  const blocked = Boolean(
    props.document.status.error ||
      props.document.status.dirty ||
      props.document.status.saving ||
      review.state.generating ||
      regenerating ||
      review.error,
  );
  const fingerprint = review.projection
    ? confirmationFingerprint(review.projection, review.state, blocked)
    : "";
  useEffect(() => {
    if (approval && approval.fingerprint !== fingerprint) {
      setApproval(null);
      actions.setMessage(
        "문서 또는 제안 상태가 바뀌어 전체 승인을 취소했습니다. 최신 내용을 확인해 주세요.",
      );
    }
  }, [approval, fingerprint, actions.setMessage]);
  return {
    review,
    setRegenerating,
    prepareGeneration: () => flushGeneration(props),
    actions,
    ...navigation,
    approval,
    setApproval,
    blocked: blocked || actions.busy || review.loading,
    confirm: () =>
      setApproval({
        fingerprint,
        proposals: groups.flatMap((g) => g.proposals),
        version: props.document.status.version,
      }),
  };
}
export type Panel = ReturnType<typeof useReviewPanel>;

async function flushGeneration(props: Props) {
  await props.document.gate.run(async () => {
    await props.document.autosave.flush();
    await props.flushTask();
  });
}

function useNavigation(projection: ReviewProjection | null) {
  const [selectedId, setSelectedId] = useState("");
  const [selection, setSelection] = useState<LogicalSelection | null>(null);
  const [jump, setJump] = useState<{
    selection: LogicalSelection;
    serial: number;
  } | null>(null);
  const groups = projection?.groups ?? [];
  const selected = groups.find((g) => g.id === selectedId) ?? groups[0];
  const choose = (group: ReviewGroup) => {
    setSelectedId(group.id);
    if (!projection) return;
    const range = group.beforeRanges[0];
    setJump({
      selection: {
        side: "before",
        from: utf16AtByte(projection.before, range.from),
        to: utf16AtByte(projection.before, range.to),
      },
      serial: Date.now(),
    });
  };
  return {
    selected,
    selection,
    setSelection,
    jump,
    choose,
    move: (direction: number) => {
      const index = groups.findIndex((g) => g.id === selected?.id);
      const next = groups[(index + direction + groups.length) % groups.length];
      if (next) choose(next);
    },
  };
}
