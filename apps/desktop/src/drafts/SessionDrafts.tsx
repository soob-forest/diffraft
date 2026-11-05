import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { editorCommand } from "../editor/api";
import { useAppClose } from "../useAppClose";
import { DraftRecovery, draftLabel } from "./DraftRecovery";
import { DraftPersistence } from "./persistence";
import { DraftStore } from "./store";
import "./drafts.css";

const DraftContext = createContext<{
  store: DraftStore;
  persistence: DraftPersistence;
} | null>(null);
export function SessionDrafts({ children }: { children: ReactNode }) {
  const [context] = useState(() => {
    const store = new DraftStore();
    const persistence = new DraftPersistence(store, {
      read: () => editorCommand({ kind: "read_drafts" }, "drafts"),
      write: (draft) => editorCommand({ kind: "write_draft", draft }, "draft"),
    });
    return { store, persistence };
  });
  const [ready, setReady] = useState(false);
  const [closing, setClosing] = useState(false);
  useEffect(() => {
    let active = true;
    void context.persistence.load().then(
      () => {
        if (active) setReady(true);
      },
      () => {},
    );
    return () => {
      active = false;
    };
  }, [context]);
  return (
    <DraftContext value={context}>
      {ready && !closing ? (
        children
      ) : (
        <DraftLoading
          closing={closing}
          onClosing={setClosing}
          retry={() => {
            void context.persistence.load().then(
              () => setReady(true),
              () => {},
            );
          }}
        />
      )}
    </DraftContext>
  );
}

function DraftLoading({
  retry,
  closing,
  onClosing,
}: {
  retry: () => void;
  closing: boolean;
  onClosing: (closing: boolean) => void;
}) {
  const drafts = useDraftPersistence();
  const [error, setError] = useState("");
  const lock = useRef(false),
    flush = useRef<(() => Promise<void>) | null>(null);
  // Children have never mounted, so no document input or draft writes exist yet.
  useAppClose(flush, setError, lock, onClosing, "initializing");
  const failed = drafts.status.startsWith("초안 복원 실패");
  return (
    <main className="empty-state" inert={closing}>
      <h1>
        {failed
          ? "작업 공간을 준비하지 못했습니다"
          : "초안을 불러오는 중입니다"}
      </h1>
      <p
        className={failed ? "error-banner" : undefined}
        role={failed ? "alert" : "status"}
      >
        {drafts.status}
      </p>
      {error && <p role="alert">{error}</p>}
      {closing && <p role="status">종료하는 중…</p>}
      <button type="button" disabled={closing} onClick={retry}>
        초안 다시 불러오기
      </button>
    </main>
  );
}

export function useDraftPersistence() {
  const context = useContext(DraftContext);
  if (!context) throw new Error("초안 저장소를 찾을 수 없습니다.");
  const status = useSyncExternalStore(
    context.persistence.subscribe,
    context.persistence.status,
  );
  return { ...context, status, flush: context.persistence.flush };
}
type DraftSummary = { message: string; retry?: () => void; busy: boolean };
export function DraftStatus({
  recovery = false,
  summary,
}: {
  recovery?: boolean;
  summary?: DraftSummary;
}) {
  const drafts = useDraftPersistence();
  return (
    <div className="draft-status" aria-live="polite">
      {summary ? <p role="status">{summary.message}</p> : drafts.status}
      {(summary ? summary.retry : drafts.status.includes("실패")) && (
        <button
          type="button"
          disabled={summary?.busy}
          onClick={() => {
            if (summary) summary.retry?.();
            else void drafts.flush().catch(() => {});
          }}
        >
          {summary ? "초안 보관 재시도" : "초안 저장 재시도"}
        </button>
      )}
      <OversizedRecovery persistence={drafts.persistence} />
      {recovery && <DraftRecovery persistence={drafts.persistence} />}
    </div>
  );
}

function OversizedRecovery({ persistence }: { persistence: DraftPersistence }) {
  const issue = useSyncExternalStore(
    persistence.subscribe,
    persistence.oversizedDraft,
  );
  if (!issue) return null;
  return (
    <span className="draft-recovery">
      {draftLabel(issue.key)}의 저장되지 않은 입력만 삭제됩니다.
      <button
        type="button"
        onClick={() => {
          void persistence.discardOversized(issue).catch(() => {});
        }}
      >
        크기 초과 초안 비우기
      </button>
    </span>
  );
}

export function useSessionDraft<T>(key: string, initial: T) {
  const { store, persistence } = useDraftPersistence();
  const value = useSyncExternalStore(store.subscribe, () =>
    store.read(key, initial),
  );
  const locked = useSyncExternalStore(store.subscribe, () =>
    store.isBlocked(key),
  );
  const storage = useSyncExternalStore(persistence.subscribe, () =>
    persistence.storageState(key, value),
  );
  return {
    value,
    locked,
    storage,
    flush: persistence.flush,
    set: (next: T) => store.write(key, next),
    replace: (expected: T, next: T) => store.replace(key, expected, next),
    update: (transform: (value: T) => T) =>
      store.update(key, initial, transform),
  };
}
