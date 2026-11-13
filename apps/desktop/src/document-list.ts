import type { AppSnapshot } from "./generated/AppSnapshot";

const STORAGE_KEY = "docreview.document-list.v2";
const LEGACY_KEY = "docreview.completed-documents.v1";
const DOCUMENT_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
type ListStorage = Pick<Storage, "getItem" | "setItem">;
type ListState = { completedIds: string[]; removedIds: string[] };
export class DocumentListError extends Error {}

// IDs are list preferences; source files and history stay in Store.
export class DocumentList {
  completedIds: string[] = [];
  removedIds: string[] = [];
  private loaded = false;
  constructor(private readonly storage: ListStorage) {}

  get hiddenIds() {
    return [...this.completedIds, ...this.removedIds];
  }

  load() {
    this.loaded = false;
    const raw = this.read(STORAGE_KEY);
    if (raw !== null) {
      const value = parse(raw);
      if (
        !value ||
        typeof value !== "object" ||
        !("completedIds" in value) ||
        !("removedIds" in value)
      )
        throw invalidSettings();
      const removedIds = identifiers(value.removedIds);
      const completedIds = identifiers(value.completedIds).filter(
        (id) => !removedIds.includes(id),
      );
      this.completedIds = completedIds;
      this.removedIds = removedIds;
      this.loaded = true;
      return;
    }
    const legacy = this.read(LEGACY_KEY);
    const completedIds = legacy === null ? [] : identifiers(parse(legacy));
    this.completedIds = completedIds;
    this.removedIds = [];
    this.loaded = true;
  }

  complete(id: string) {
    this.ensureLoaded();
    if (this.removedIds.includes(id))
      throw new DocumentListError(
        "목록에서 제거된 문서는 먼저 다시 열어 주세요.",
      );
    this.save({
      completedIds: [...new Set([...this.completedIds, id])],
      removedIds: this.removedIds,
    });
  }
  forget(id: string) {
    this.ensureLoaded();
    if (!this.completedIds.includes(id))
      throw new DocumentListError(
        "완료한 문서만 목록에서 완전히 제거할 수 있습니다.",
      );
    this.save({
      completedIds: this.completedIds.filter((value) => value !== id),
      removedIds: [...new Set([...this.removedIds, id])],
    });
  }
  restore(id: string) {
    this.ensureLoaded();
    if (!this.hiddenIds.includes(id)) return;
    this.save({
      completedIds: this.completedIds.filter((value) => value !== id),
      removedIds: this.removedIds.filter((value) => value !== id),
    });
  }
  ensureLoaded() {
    if (!this.loaded) this.load();
  }
  private read(key: string) {
    try {
      return this.storage.getItem(key);
    } catch (reason) {
      if (!(reason instanceof DOMException)) throw reason;
      throw new DocumentListError(
        "문서 목록 설정을 읽을 수 없습니다. 문서와 기록은 유지됩니다.",
      );
    }
  }
  private save(state: ListState) {
    identifiers(state.completedIds);
    identifiers(state.removedIds);
    try {
      this.storage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (reason) {
      if (!(reason instanceof DOMException)) throw reason;
      throw new DocumentListError(
        "문서 목록 설정을 저장하지 못했습니다. 다시 시도해 주세요.",
      );
    }
    this.completedIds = state.completedIds;
    this.removedIds = state.removedIds;
  }
}
function parse(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch (reason) {
    if (!(reason instanceof SyntaxError)) throw reason;
    throw invalidSettings();
  }
}
function identifiers(value: unknown): string[] {
  if (
    !Array.isArray(value) ||
    value.some((id) => typeof id !== "string" || !DOCUMENT_ID.test(id))
  )
    throw invalidSettings();
  return [...new Set(value)];
}
function invalidSettings() {
  return new DocumentListError(
    "저장된 문서 목록 설정의 형식이 올바르지 않습니다. 문서와 기록은 유지됩니다.",
  );
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
