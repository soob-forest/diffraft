import { useEffect, useState } from "react";
import type { DocumentModel } from "../editor/useDocument";
import type { ConversationResult } from "../generated/ConversationResult";
import type { ReviewGroup } from "../generated/ReviewGroup";
import type { ReviewProjection } from "../generated/ReviewProjection";
import type { Approval } from "./ApprovalDialog";
import type { LogicalSelection } from "./coordinates";
import { groupAtSelection, groupJumpSelection } from "./group-selection";
import { reviewRows } from "./rows";
import { expandCandidateSelection } from "./selection-expansion";
import { confirmationFingerprint, reviewFingerprint } from "./state";
import { useHistory } from "./useHistory";
import { useReview } from "./useReview";
import { useReviewActions } from "./useReviewActions";
import { useSelectedRequest } from "./useSelectedRequest";

type Props = {
  document: DocumentModel;
  taskId: string;
  flushTask: () => Promise<void>;
  requestedResult?: ConversationResult | null;
};
export function useReviewPanel(props: Props) {
  const review = useReview(
    props.taskId,
    props.document.autosave.document.versionId,
  );
  const actions = useReviewActions(props.document, review);
  const history = useHistory(props.requestedResult);
  const selectedRequest = useSelectedRequest(
    props.document.state.document.id,
    props.taskId,
  );
  const [selectionIssue, setSelectionIssue] = useState("");
  const [regenerating, setRegenerating] = useState(false);
  const navigation = useNavigation(review.projection);
  const detail = useDetail(navigation.selected?.id ?? "");
  const blocked = Boolean(
    props.document.status.error ||
      props.document.status.dirty ||
      props.document.status.saving ||
      review.state.generating ||
      regenerating ||
      review.error,
  );
  const approval = useApproval({
    review,
    actions,
    document: props.document,
    blocked,
  });
  return {
    review,
    history,
    selectedRequest,
    selectionIssue,
    setSelectionIssue,
    ...selectionActions({
      review,
      navigation,
      selectedRequest,
      setSelectionIssue,
    }),
    setRegenerating,
    prepareGeneration: () => flushGeneration(props),
    actions,
    ...navigation,
    ...detail,
    ...approval,
    blocked: blocked || actions.busy || review.loading,
  };
}

function useApproval({
  review,
  actions,
  document,
  blocked,
}: {
  review: ReturnType<typeof useReview>;
  actions: ReturnType<typeof useReviewActions>;
  document: DocumentModel;
  blocked: boolean;
}) {
  const [approval, setApproval] = useState<Approval | null>(null);
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
    approval,
    setApproval,
    confirm: () =>
      setApproval({
        fingerprint,
        proposals: (review.projection?.groups ?? []).flatMap(
          (g) => g.proposals,
        ),
        version: document.status.version,
      }),
  };
}
export type Panel = ReturnType<typeof useReviewPanel>;

type DetailKind = "summary" | "comment" | "candidate" | "regenerate";
function useDetail(groupId: string) {
  const [detail, setDetail] = useState({
    groupId,
    kind: "summary" as DetailKind,
    proposalId: "",
  });
  useEffect(() => {
    setDetail((current) =>
      current.groupId === groupId
        ? current
        : { groupId, kind: "summary", proposalId: "" },
    );
  }, [groupId]);
  return {
    detail,
    openDetail: (kind: DetailKind, proposalId: string) =>
      setDetail({ groupId, kind, proposalId }),
  };
}

async function flushGeneration(props: Props) {
  await props.document.gate.run(async () => {
    await props.document.autosave.flush();
    await props.flushTask();
  });
}

function useNavigation(projection: ReviewProjection | null) {
  const [selectedId, setSelectedId] = useState("");
  const [selection, setSelection] = useState<LogicalSelection | null>(null);
  const fingerprint = reviewFingerprint(projection);
  useEffect(() => {
    if (fingerprint) setSelection(null);
  }, [fingerprint]);
  const { jump, setJump } = useReviewJump();
  const groups = projection?.groups ?? [];
  const selected = groups.find((g) => g.id === selectedId) ?? groups[0];
  return {
    selected,
    selectRange: (selection: LogicalSelection) => {
      setSelection(selection);
      setJump((previous) => ({
        selection,
        serial: (previous?.serial ?? 0) + 1,
      }));
    },
    selectGroup: (id: string) => {
      if (groups.some((group) => group.id === id)) setSelectedId(id);
    },
    selection,
    setSelection: (value: LogicalSelection | null) => {
      setSelection(value);
      if (value && projection) {
        const group = groupAtSelection(projection, value);
        if (group) setSelectedId(group.id);
      }
    },
    jump,
    choose: (group: ReviewGroup) => {
      if (projection) chooseGroup(projection, group, setSelectedId, setJump);
    },
    move: (direction: number) => {
      const index = groups.findIndex((g) => g.id === selected?.id);
      const next = groups[(index + direction + groups.length) % groups.length];
      if (next && projection)
        chooseGroup(projection, next, setSelectedId, setJump);
    },
  };
}

function selectionActions({
  review,
  navigation,
  selectedRequest,
  setSelectionIssue,
}: {
  review: ReturnType<typeof useReview>;
  navigation: ReturnType<typeof useNavigation>;
  selectedRequest: ReturnType<typeof useSelectedRequest>;
  setSelectionIssue: (message: string) => void;
}) {
  return {
    expandSelection: (unit: "sentence" | "paragraph") => {
      try {
        if (review.projection)
          navigation.selectRange(
            expandCandidateSelection(
              review.projection,
              navigation.selection,
              unit,
            ),
          );
        setSelectionIssue("");
      } catch (error) {
        setSelectionIssue(
          error instanceof Error
            ? error.message
            : "범위를 드래그로 다시 지정해 주세요.",
        );
      }
    },
    startSelectedRequest: () => {
      if (review.projection)
        selectedRequest.begin(review.projection, navigation.selection);
    },
  };
}

function useReviewJump() {
  const [jump, setJump] = useState<{
    selection: LogicalSelection;
    serial: number;
  } | null>(null);
  return { jump, setJump };
}

function chooseGroup(
  projection: ReviewProjection,
  group: ReviewGroup,
  setSelectedId: (id: string) => void,
  setJump: ReturnType<typeof useReviewJump>["setJump"],
) {
  setSelectedId(group.id);
  const target = groupJumpSelection(
    projection,
    reviewRows(projection, new Set(), false),
    group.id,
  );
  if (!target) return;
  setJump((previous) => ({
    selection: target,
    serial: (previous?.serial ?? 0) + 1,
  }));
}
