import type { DocumentSnapshot } from "../generated/DocumentSnapshot";
import type { EditorAction } from "../generated/EditorAction";
import { errorMessage } from "../ipc";

export const AUTOSAVE_MS = 500;
type SaveAction = Extract<EditorAction, { kind: "save" }>;
type Save = (request: SaveAction) => Promise<DocumentSnapshot>;
export type SaveStatus = {
  label: string;
  dirty: boolean;
  saving: boolean;
  error: string;
  version: number;
};
class CompositionPending extends Error {
  constructor() {
    super("한글 조합을 완료한 뒤 다시 시도해 주세요.");
  }
}

export class Autosave {
  content: string;
  document: DocumentSnapshot;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private running: Promise<void> | undefined;
  private failed: unknown;
  private pending: SaveAction | undefined;
  private composing = false;
  private disposed = false;
  private preserved: string | undefined;

  constructor(
    document: DocumentSnapshot,
    private save: Save,
    private notify: (status: SaveStatus) => void,
  ) {
    this.document = document;
    this.content = document.content;
    if (document.status !== "READY")
      this.failed = new Error("외부 변경 또는 저장 복구를 먼저 해결해 주세요.");
  }

  get status(): SaveStatus {
    const dirty = this.content !== this.document.content;
    const error = this.failed ? errorMessage(this.failed) : "";
    return {
      dirty,
      error,
      saving: Boolean(this.running),
      version: this.document.version,
      label: error
        ? "저장 중지"
        : this.running
          ? "저장 중…"
          : dirty
            ? "저장 대기"
            : "저장됨",
    };
  }

  change(content: string): void {
    this.preserved = undefined;
    this.content = content;
    this.schedule();
    this.emit();
  }

  composition(active: boolean): void {
    this.composing = active;
    clearTimeout(this.timer);
    if (!active) this.schedule();
  }

  block(error: unknown): void {
    this.failed = error;
    clearTimeout(this.timer);
    this.emit();
  }

  async flush(): Promise<void> {
    clearTimeout(this.timer);
    if (this.composing) throw new CompositionPending();
    if (
      !this.pending &&
      !this.running &&
      this.content === this.document.content
    )
      return;
    if (this.failed) throw this.failed;
    if (this.running) {
      await this.running;
      return this.flush();
    }
    if (!this.pending && this.content === this.document.content) return;
    this.running = this.drain();
    this.emit();
    try {
      await this.running;
    } finally {
      this.running = undefined;
      this.emit();
    }
  }

  async retry(): Promise<void> {
    this.failed = undefined;
    await this.flush();
  }

  preservedCopy(content: string): void {
    if (content === this.content) this.preserved = content;
  }

  async flushForLeave(): Promise<void> {
    if (!this.running && !this.composing && this.preserved === this.content)
      return;
    await this.flush();
  }

  adoptSaved(document: DocumentSnapshot, discardBuffered = false): void {
    if (this.running || this.composing)
      throw new Error("저장과 입력 조합이 끝난 뒤 새 버전을 열어 주세요.");
    if (document.id !== this.document.id || document.status !== "READY")
      throw new Error("현재 문서의 저장된 버전만 열 수 있습니다.");
    if (!discardBuffered && (this.pending || this.status.dirty))
      throw new Error("남아 있는 입력을 먼저 저장해 주세요.");
    if (document.version < this.document.version)
      throw new Error("이전 저장 응답으로 현재 내용을 바꿀 수 없습니다.");
    clearTimeout(this.timer);
    this.document = document;
    this.content = document.content;
    this.pending = undefined;
    this.failed = undefined;
    this.preserved = undefined;
    this.emit();
  }

  dispose(): void {
    this.disposed = true;
    clearTimeout(this.timer);
  }
  activate(): void {
    this.disposed = false;
  }

  private async drain(): Promise<void> {
    while (
      (this.pending || this.content !== this.document.content) &&
      !this.composing &&
      !this.disposed
    ) {
      this.pending ??= {
        kind: "save",
        documentId: this.document.id,
        expectedVersion: this.document.version,
        content: this.content,
        operationId: crypto.randomUUID(),
      };
      try {
        this.document = await this.save(this.pending);
        this.pending = undefined;
      } catch (error) {
        this.block(error);
        throw error;
      }
      if (this.failed) throw this.failed;
    }
    if (this.composing) throw new CompositionPending();
  }

  private schedule(): void {
    clearTimeout(this.timer);
    if (this.failed || this.composing || this.disposed) return;
    this.timer = setTimeout(() => {
      void this.flush().catch((error: unknown) => {
        if (!(error instanceof CompositionPending)) this.block(error);
      });
    }, AUTOSAVE_MS);
  }

  private emit(): void {
    if (!this.disposed) this.notify(this.status);
  }
}
