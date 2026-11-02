import { DraftDecodeError } from "./decode-error";

export function object(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw invalidDraft();
  return value as Record<string, unknown>;
}
export function invalidDraft() {
  return new DraftDecodeError(
    "저장된 초안 형식을 확인할 수 없습니다. 기록을 덮어쓰지 않았습니다.",
  );
}
export function range(value: unknown) {
  const data = object(value);
  if (
    typeof data.quote !== "string" ||
    !Number.isSafeInteger(data.fromUtf16) ||
    !Number.isSafeInteger(data.toUtf16) ||
    Number(data.fromUtf16) < 0 ||
    Number(data.toUtf16) < Number(data.fromUtf16)
  )
    throw invalidDraft();
  return data;
}
export function scopeDraft(data: Record<string, unknown>) {
  if (!["whole", "section", "selection"].includes(String(data.kind)))
    throw invalidDraft();
  if (data.captured === null) return;
  const captured = object(data.captured),
    value = object(captured.value),
    selection = object(value.selection);
  if (!Number.isSafeInteger(captured.epoch)) throw invalidDraft();
  validateSourceRange(value, selection);
}
export function selectedDraft(data: Record<string, unknown>) {
  if ("key" in data) {
    selectedIndex(data);
    return;
  }
  if (data.target !== null) selectedTarget(object(data.target));
  validateSelectedFields(data);
  if (data.prepared !== null) prepared(data);
}
function selectedTarget(target: Record<string, unknown>) {
  // Existing v1 candidate drafts predate the explicit target kind.
  if (target.kind === undefined && typeof target.proposalId === "string")
    target.kind = "candidate";
  if (!["candidate", "confirmed", "rewrite"].includes(String(target.kind)))
    throw invalidDraft();
  for (const field of ["documentId", "expectedHeadId", "candidate", "title"])
    if (typeof target[field] !== "string") throw invalidDraft();
  if (target.kind !== "confirmed" && typeof target.batchId !== "string")
    throw invalidDraft();
  if (
    target.sourceVersion !== undefined &&
    !Number.isSafeInteger(target.sourceVersion)
  )
    throw invalidDraft();
  const selection = range(target.selection);
  if (
    typeof selection.taskId !== "string" ||
    String(target.candidate).slice(
      Number(selection.fromUtf16),
      Number(selection.toUtf16),
    ) !== selection.quote
  )
    throw invalidDraft();
  if (target.kind === "candidate") candidateIdentity(target);
}
function prepared(data: Record<string, unknown>) {
  let snapshot = object(data.prepared);
  if (snapshot.kind === undefined && typeof snapshot.context === "string") {
    snapshot = { kind: "regenerate", value: snapshot };
    data.prepared = snapshot;
  }
  if (!["regenerate", "selection"].includes(String(snapshot.kind)))
    throw invalidDraft();
  const value = object(snapshot.value),
    request = object(value.request);
  if (
    typeof value.context !== "string" ||
    typeof request.instruction !== "string"
  )
    throw invalidDraft();
  savedRequest(value.request);
  preparedContext(object(JSON.parse(value.context)));
}

export function requestDraft(data: Record<string, unknown>) {
  if (
    !["PATCH", "EXPLAIN", "REWRITE"].includes(String(data.mode)) ||
    typeof data.instruction !== "string"
  )
    throw invalidDraft();
  if (data.instructions !== undefined) {
    const values = object(data.instructions);
    if (
      Object.entries(values).some(
        ([key, value]) =>
          !["PATCH", "EXPLAIN", "REWRITE"].includes(key) ||
          typeof value !== "string",
      )
    )
      throw invalidDraft();
  }
  if (
    data.prepareOnOpen !== undefined &&
    typeof data.prepareOnOpen !== "boolean"
  )
    throw invalidDraft();
  if (data.pending != null) pendingRequest(data.pending);
}
export function savedRequest(value: unknown) {
  const request = object(value),
    model = object(request.model);
  if (
    !["claude", "codex"].includes(String(model.provider)) ||
    typeof model.model !== "string"
  )
    throw invalidDraft();
  for (const field of [
    "documentId",
    "expectedHeadId",
    "operationId",
    "instruction",
  ])
    if (typeof request[field] !== "string") throw invalidDraft();
}

function validateSourceRange(
  value: Record<string, unknown>,
  selection: Record<string, unknown>,
) {
  if (
    ![selection.from, selection.to, selection.cursor].every(
      Number.isSafeInteger,
    )
  )
    throw invalidDraft();
  if (typeof value.quote !== "string" || typeof value.source !== "string")
    throw invalidDraft();
  if (
    Number(selection.from) < 0 ||
    Number(selection.to) <= Number(selection.from)
  )
    throw invalidDraft();
  if (
    value.source.slice(Number(selection.from), Number(selection.to)) !==
    value.quote
  )
    throw invalidDraft();
}
function selectedIndex(data: Record<string, unknown>) {
  if (typeof data.key !== "string") throw invalidDraft();
  if (data.key) {
    const key: unknown = JSON.parse(data.key);
    if (
      !Array.isArray(key) ||
      key[0] !== "selected-request" ||
      !(key.length === 7 || (key.length === 6 && key[3] === "confirmed")) ||
      key.some((part) => typeof part !== "string")
    )
      throw invalidDraft();
  }
}
function validateSelectedFields(data: Record<string, unknown>) {
  if (data.commentIds !== null) {
    if (
      !Array.isArray(data.commentIds) ||
      data.commentIds.some((id) => typeof id !== "string")
    )
      throw invalidDraft();
  }
  if (data.replacement !== undefined && typeof data.replacement !== "string")
    throw invalidDraft();
}
function candidateIdentity(target: Record<string, unknown>) {
  if (
    typeof target.proposalId !== "string" ||
    !Number.isSafeInteger(target.expectedRevision)
  )
    throw invalidDraft();
}
function preparedContext(context: Record<string, unknown>) {
  for (const field of ["goal", "pinnedRules", "commonRules", "summary"])
    if (typeof context[field] !== "string") throw invalidDraft();
  for (const field of ["comments", "messages", "decisions"])
    if (!Array.isArray(context[field])) throw invalidDraft();
  const operation = object(object(context.target).operation);
  if (
    typeof operation.before !== "string" ||
    typeof operation.after !== "string"
  )
    throw invalidDraft();
}

function pendingRequest(value: unknown) {
  const pending = object(value),
    scope = object(pending.scope);
  if (
    !["generate", "rewrite"].includes(String(pending.kind)) ||
    typeof scope.text !== "string" ||
    !Number.isSafeInteger(scope.version)
  )
    throw invalidDraft();
  savedRequest(pending.request);
}
