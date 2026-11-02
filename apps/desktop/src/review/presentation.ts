import type { ReviewProjection } from "../generated/ReviewProjection";

type Kind =
  | "empty"
  | "generating"
  | "history"
  | "discarded"
  | "stale"
  | "conflict"
  | "rewrite"
  | "pending"
  | "completed"
  | "applied"
  | "unchanged";
export type ReviewPresentation = {
  kind: Kind;
  title: string;
  description: string;
  accepted: number;
  rejected: number;
};
const messages: Record<Kind, [string, string]> = {
  empty: ["아직 제안이 없습니다", "이 작업에서 AI 요청을 시작해 주세요."],
  generating: [
    "생성 중 · 승인 잠김",
    "기존 후보는 유지됩니다. 생성 중단은 요청 패널에서 할 수 있습니다.",
  ],
  history: [
    "이전 제안 · 읽기 전용",
    "당시 기록입니다. 현재 검토로 돌아가 최신 상태를 확인해 주세요.",
  ],
  discarded: [
    "취소된 제안 · 읽기 전용",
    "확정본은 유지됩니다. 다시 사용하려면 최신 문서에서 새 요청을 준비해 주세요.",
  ],
  stale: [
    "최신 문서에서 다시 제안 필요",
    "기준 버전이 바뀌었습니다. 기존 지시와 코멘트를 참고해 최신 기준으로 요청해 주세요.",
  ],
  conflict: [
    "대상 범위를 다시 확인해 주세요",
    "원문 또는 범위가 일치하지 않아 승인할 수 없습니다. 파일 상태와 최신 문서를 확인해 주세요.",
  ],
  rewrite: [
    "전체 재작성 후보",
    "아직 확정본에 반영하지 않았습니다. 적용은 전체 문서 단위입니다.",
  ],
  pending: ["변경 검토", "선택한 변경을 검토한 뒤 승인하거나 거절해 주세요."],
  completed: [
    "검토 완료",
    "확정본을 미리 보거나 문서 메뉴에서 내보낼 수 있습니다.",
  ],
  applied: [
    "전체 재작성 적용 완료",
    "적용된 후보는 읽기 전용입니다. 확정본에서 결과를 확인해 주세요.",
  ],
  unchanged: [
    "요청 범위에서 변경 없음",
    "이번 결과에는 검토할 변경이 없습니다. 확정본은 유지됩니다.",
  ],
};

export function reviewPresentation(
  projection: ReviewProjection | null,
  generating = false,
): ReviewPresentation {
  const proposals = projection?.batch.proposals ?? [];
  const accepted = proposals.filter((p) => p.decision === "ACCEPTED").length;
  const rejected = proposals.filter((p) => p.decision === "REJECTED").length;
  const kind = presentationKind(projection, generating);
  const [title, description] = messages[kind];
  return { kind, title, description, accepted, rejected };
}

function presentationKind(
  p: ReviewProjection | null,
  generating: boolean,
): Kind {
  if (generating) return "generating";
  if (!p) return "empty";
  const status: Record<string, Kind> = {
    DISCARDED: "discarded",
    APPLIED: "applied",
    ARCHIVED: "history",
  };
  if (p.batch.status !== "ACTIVE") return status[p.batch.status] ?? "history";
  return activeKind(p);
}
function activeKind(p: ReviewProjection): Kind {
  const pending = p.batch.proposals.filter((v) => v.decision === "PENDING");
  if (pending.some((v) => v.validity === "CONFLICT")) return "conflict";
  if (staleSelection(p, pending)) return "stale";
  if (p.batch.mode === "REWRITE") return "rewrite";
  if (p.groups.length) return "pending";
  if (
    p.batch.proposals.length &&
    p.batch.proposals.every(
      (v) => v.decision === "ACCEPTED" || v.decision === "REJECTED",
    )
  )
    return "completed";
  return p.batch.proposals.length ? "history" : "unchanged";
}

function staleSelection(
  p: ReviewProjection,
  pending: ReviewProjection["batch"]["proposals"],
) {
  return (
    pending.some((v) => v.validity === "STALE") ||
    ((pending.length > 0 || p.batch.mode === "REWRITE") &&
      p.currentHeadId !== p.batch.applyHeadId)
  );
}
