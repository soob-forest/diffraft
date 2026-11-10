import { useEffect, useState } from "react";
import type { DocumentModel } from "../editor/useDocument";
import type { ConversationResult } from "../generated/ConversationResult";
import { useDocumentGeneration } from "../generation/generation-activity";
import type { Approval } from "./ApprovalDialog";
import { expandCandidateSelection } from "./selection-expansion";
import { confirmationFingerprint } from "./state";
import { useGroupNavigation } from "./useGroupNavigation";
import { useHistory } from "./useHistory";
import { useReview } from "./useReview";
import { useReviewActions } from "./useReviewActions";
import { useSelectedRequest } from "./useSelectedRequest";

type Props = {
  active: boolean;
  document: DocumentModel;
  taskId: string;
  flushTask: () => Promise<void>;
  requestedResult?: ConversationResult | null;
};
export function useReviewPanel(props: Props) {
  const { review, actions, history, selectedRequest, navigation, detail } =
    usePanelModels(props);
  const [selectionIssue, setSelectionIssue] = useState("");
  const [regenerating, setRegenerating] = useState(false);
  const generating = useDocumentGeneration(props.document.state.document.id);
  const blocked = reviewBlocked(
    props.document,
    review,
    regenerating || generating,
  );
  const approval = useApproval({
    review,
    actions,
    document: props.document,
    blocked,
  });
  return {
    requestedResult: props.requestedResult,
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

function usePanelModels(props: Props) {
  const review = useReview(
    props.taskId,
    props.document.autosave.document.versionId,
    props.active ? props.document.state.document.id : "",
  );
  const actions = useReviewActions(props.document, review);
  const history = useHistory(props.requestedResult);
  const selectedRequest = useSelectedRequest(
    props.document.state.document.id,
    props.taskId,
  );
  const navigation = useGroupNavigation(review.projection);
  const detail = useDetail(navigation.selected?.id ?? "");
  return { review, actions, history, selectedRequest, navigation, detail };
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
        "attention",
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

function selectionActions({
  review,
  navigation,
  selectedRequest,
  setSelectionIssue,
}: {
  review: ReturnType<typeof useReview>;
  navigation: ReturnType<typeof useGroupNavigation>;
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

function reviewBlocked(
  document: DocumentModel,
  review: ReturnType<typeof useReview>,
  regenerating: boolean,
) {
  return Boolean(
    document.status.error ||
      document.status.dirty ||
      document.status.saving ||
      review.state.generating ||
      regenerating ||
      review.error,
  );
}
