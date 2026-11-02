// Same serialized UTF-8 limit as Rust domain/drafts.rs.
export const MAX_DRAFT_RECORD_BYTES = 3 * 1024 * 1024;
export class DraftSizeError extends Error {
  constructor() {
    super(
      "초안 저장 크기(3 MiB)를 초과했습니다. 선택 범위를 줄이거나 크기가 초과된 초안을 비워 주세요. 다른 입력은 유지됩니다.",
    );
    this.name = "DraftSizeError";
  }
}
export function serializeDraft(value: unknown): string | null {
  const json = JSON.stringify(value) ?? null;
  if (
    json !== null &&
    new TextEncoder().encode(json).length > MAX_DRAFT_RECORD_BYTES
  )
    throw new DraftSizeError();
  return json;
}
