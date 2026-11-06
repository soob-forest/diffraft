import type { PendingRequest } from "./request";
import type { RequestMode } from "./request-draft";
export const requestLabels: Record<RequestMode, string> = {
  PATCH: "수정 제안 받기 · 기존 문장 다듬기",
  EXPLAIN: "질문하기",
  REWRITE: "수정 제안 받기 · 새 전체 초안 만들기",
};
export function requestTargetLabel(pending: PendingRequest) {
  const version = `v${pending.scope.version}`;
  if (pending.kind === "rewrite") return `확정본 전체 · ${version}`;
  const { selection, question } = pending.request;
  if (question) return `${question.label}의 수정안 · ${version}`;
  if (selection.kind === "whole") return `확정본 전체 · ${version}`;
  if (selection.kind === "section")
    return `현재 섹션 · ${pending.scope.blocks[0]?.headingPath.at(-1) ?? "문서 시작"} · ${version}`;
  return `선택한 원문 ${Array.from(pending.scope.text).length.toLocaleString()}자 · ${version}`;
}
