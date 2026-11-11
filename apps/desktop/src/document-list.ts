import type { AppSnapshot } from "./generated/AppSnapshot";

const STORAGE_KEY = "docreview.completed-documents.v1";
const DOCUMENT_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
type ListStorage = Pick<Storage, "getItem" | "setItem">;
export class DocumentListError extends Error {}

// Only document IDs are UI preferences; source files and history stay in Store.
export class DocumentList {
  ids: string[] = [];
  constructor(private readonly storage: ListStorage) {}

  load() {
    const raw = this.read();
    if (raw === null) return;
    let value: unknown;
    try {
      value = JSON.parse(raw);
    } catch (reason) {
      if (!(reason instanceof SyntaxError)) throw reason;
      throw new DocumentListError(
        "저장된 문서 목록 설정을 읽을 수 없습니다. 문서와 기록은 유지됩니다.",
      );
    }
    if (
      !Array.isArray(value) ||
      value.some((id) => typeof id !== "string" || !DOCUMENT_ID.test(id))
    )
      throw new DocumentListError(
        "저장된 문서 목록 설정의 형식이 올바르지 않습니다. 문서와 기록은 유지됩니다.",
      );
    this.ids = [...new Set(value)];
  }

  remove(id: string) {
    this.save([...new Set([...this.ids, id])]);
  }
  restore(id: string) {
    if (this.ids.includes(id))
      this.save(this.ids.filter((value) => value !== id));
  }
  private read() {
    try {
      return this.storage.getItem(STORAGE_KEY);
    } catch (reason) {
      if (!(reason instanceof DOMException)) throw reason;
      throw new DocumentListError(
        "문서 목록 설정을 읽을 수 없습니다. 문서와 기록은 유지됩니다.",
      );
    }
  }
  private save(ids: string[]) {
    if (ids.some((id) => !DOCUMENT_ID.test(id)))
      throw new Error("문서 식별자가 올바르지 않습니다.");
    try {
      this.storage.setItem(STORAGE_KEY, JSON.stringify(ids));
    } catch (reason) {
      if (!(reason instanceof DOMException)) throw reason;
      throw new DocumentListError(
        "문서 목록 설정을 저장하지 못했습니다. 다시 시도해 주세요.",
      );
    }
    this.ids = ids;
  }
}

export function visibleWorkspace(
  snapshot: AppSnapshot,
  removed: readonly string[],
): AppSnapshot {
  const documents = snapshot.documents.filter(
    (document) => !removed.includes(document.id),
  );
  const selectedDocumentId = documents.some(
    (document) => document.id === snapshot.selectedDocumentId,
  )
    ? snapshot.selectedDocumentId
    : (documents[0]?.id ?? null);
  return { ...snapshot, documents, selectedDocumentId };
}

export function completedDocuments(
  snapshot: AppSnapshot,
  removed: readonly string[],
) {
  return snapshot.documents.filter((document) => removed.includes(document.id));
}
