import type { DraftStore } from "../drafts/store";
import { type RequestDraft, switchRequestMode } from "./request-draft";

export function requestKey(documentId: string, taskId: string) {
  return JSON.stringify(["request", documentId, taskId]);
}
function targetKey(key: string, draft: RequestDraft) {
  const identity = draft.question
    ? [
        "question",
        draft.question.batchId,
        JSON.stringify(draft.question.subject),
      ]
    : ["source", draft.referenceBatchId ?? "confirmed"];
  return JSON.stringify([...JSON.parse(key), ...identity]);
}
export function chooseRequestTarget(
  store: DraftStore,
  key: string,
  target: Pick<RequestDraft, "question" | "referenceBatchId">,
  mode: RequestDraft["mode"],
) {
  if (store.isBlocked(key))
    throw new Error("요청 초안이 잠겼습니다. 초안 복구에서 확인해 주세요.");
  const destination = targetKey(key, { mode, instruction: "", ...target });
  if (store.isBlocked(destination))
    throw new Error(
      "이 대상의 초안 복구가 필요합니다. 현재 입력을 유지했습니다.",
    );
  const current = store.peek(key) as RequestDraft | undefined;
  if (current) preserveRequestTarget(store, key, current);
  const saved = store.peek(destination) as RequestDraft | undefined;
  const next = {
    ...switchRequestMode(saved ?? { mode, instruction: "" }, mode),
    ...target,
    mode,
    pending: null,
    prepareOnOpen: false,
  };
  store.write(key, next);
  return next;
}
export function savedRequestTargets(
  store: DraftStore,
  documentId: string,
  taskId: string,
) {
  return [...store.entries()].flatMap(([key, value]) => {
    const parts = JSON.parse(key);
    return parts[0] === "request" &&
      parts[1] === documentId &&
      parts[2] === taskId &&
      parts.length > 3 &&
      value
      ? [{ key, value: value as RequestDraft }]
      : [];
  });
}

export function preserveRequestTarget(
  store: DraftStore,
  key: string,
  current: RequestDraft,
) {
  const destination = targetKey(key, current);
  if (store.isBlocked(destination))
    throw new Error(
      "이 대상의 초안 복구가 필요합니다. 현재 입력을 유지했습니다.",
    );
  store.write(destination, { ...current, pending: null, prepareOnOpen: false });
}
