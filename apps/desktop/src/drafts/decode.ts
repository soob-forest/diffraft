import type { DraftRecord } from "../generated/DraftRecord";
import { DraftDecodeError } from "./decode-error";
import {
  invalidDraft,
  object,
  range,
  requestDraft,
  savedRequest,
  scopeDraft,
  selectedDraft,
} from "./draft-shapes";

export function decodeDraft(record: DraftRecord): unknown {
  if (record.schemaVersion !== 1)
    throw new DraftDecodeError(
      "지원하지 않는 초안 버전입니다. 저장된 기록은 유지됩니다.",
    );
  if (record.valueJson === null) return null;
  const key = draftKey(record.key),
    value: unknown = JSON.parse(record.valueJson);
  if (key[0] === "comment" && ["before", "after"].includes(String(value)))
    return value;
  const data = object(value),
    validate = validators[key[0]];
  if (!validate) throw invalidDraft();
  validate(data);
  validateDraftOwner(key, data);
  return data;
}
function validateDraftOwner(key: string[], data: Record<string, unknown>) {
  if (data.question && key[0] === "request") {
    const target = object(data.question);
    if (target.documentId !== key[1] || target.taskId !== key[2])
      throw invalidDraft();
  }
  if (key[0] === "first-request" && data.taskId !== key[2])
    throw invalidDraft();
  if (key[0] === "selected-request") validateOwner(key, data);
}
function draftKey(json: string): string[] {
  const key: unknown = JSON.parse(json);
  if (
    !Array.isArray(key) ||
    key.length < 3 ||
    key.some((part) => typeof part !== "string")
  )
    throw invalidDraft();
  return key;
}
function commentDraft(data: Record<string, unknown>) {
  if (typeof data.text !== "string" || !Number.isSafeInteger(data.revision))
    throw invalidDraft();
  range(data.target);
}
function candidateDraft(data: Record<string, unknown>) {
  if (typeof data.after !== "string") throw invalidDraft();
}
function generationDraft(data: Record<string, unknown>) {
  if (typeof data.instruction !== "string") throw invalidDraft();
  if (data.pending != null) savedRequest(data.pending);
}
function selectedRequestDraft(data: Record<string, unknown>) {
  if (typeof data.instruction !== "string") throw invalidDraft();
  selectedDraft(data);
}
function validateOwner(key: string[], data: Record<string, unknown>) {
  if (typeof data.key === "string" && data.key) {
    const nested = draftKey(data.key);
    if (nested[1] !== key[1] || nested[2] !== key[2]) throw invalidDraft();
    if (key[3] === "source-active" && !isConfirmedKey(nested))
      throw invalidDraft();
  }
  if (data.target) {
    const target = object(data.target),
      selection = object(target.selection);
    if (target.documentId !== key[1] || selection.taskId !== key[2])
      throw invalidDraft();
  }
}
function isConfirmedKey(key: string[]) {
  return (
    (key.length === 6 && key[3] === "confirmed") ||
    (key.length === 7 && key[4] === "confirmed")
  );
}
const validators: Record<string, (data: Record<string, unknown>) => void> = {
  "first-request": firstRequestDraft,
  "unit-comment": unitCommentDraft,
  "review-navigation": reviewNavigationDraft,
  request: requestDraft,
  comment: commentDraft,
  candidate: candidateDraft,
  regenerate: generationDraft,
  rewrite: generationDraft,
  "selected-request": selectedRequestDraft,
  "source-scope": scopeDraft,
};

function firstRequestDraft(data: Record<string, unknown>) {
  requestDraft(data);
  if (data.handedOff !== undefined && typeof data.handedOff !== "boolean")
    throw invalidDraft();
  if (data.sourceAction !== undefined && typeof data.sourceAction !== "boolean")
    throw invalidDraft();
  for (const field of ["taskId", "name", "goal", "rules"])
    if (typeof data[field] !== "string") throw invalidDraft();
  if (
    !["whole", "section", "selection"].includes(String(data.scopeKind)) ||
    !Number.isSafeInteger(data.cursor)
  )
    throw invalidDraft();
  if (data.source !== undefined)
    scopeDraft({
      kind: "selection",
      captured: { epoch: 0, value: data.source },
    });
}

function unitCommentDraft(data: Record<string, unknown>) {
  if (
    data.version !== 1 ||
    typeof data.text !== "string" ||
    typeof data.id !== "string"
  )
    throw invalidDraft();
}

function reviewNavigationDraft(data: Record<string, unknown>) {
  if (
    data.version !== 1 ||
    typeof data.selectedId !== "string" ||
    typeof data.scrollKey !== "string" ||
    typeof data.originalScrollKey !== "string" ||
    !["all", "pending", "processed"].includes(String(data.filter)) ||
    [data.split, data.full, data.whitespace, data.original].some(
      (value) => typeof value !== "boolean",
    )
  )
    throw invalidDraft();
}
