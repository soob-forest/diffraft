import { ConnectionSettings } from "./connection/ConnectionSettings";
import { GenerationStatus } from "./connection/GenerationStatus";
import { DocumentWorkspace } from "./editor/DocumentWorkspace";
import { useWorkspace } from "./workspace";

export function App() {
  const workspace = useWorkspace();
  return (
    <div className="app-shell">
      <header className="app-header" inert={workspace.closing}>
        <span className="brand-icon">D</span>
        <strong>DocReview</strong>
        <span>내 작업 공간</span>
        <GenerationStatus />
      </header>
      <Sidebar workspace={workspace} />
      <div className="workspace-body" inert={workspace.busy}>
        {workspace.error && (
          <div role="alert" className="error-banner">
            {workspace.error}
          </div>
        )}
        {workspace.editor ? (
          <DocumentWorkspace
            key={workspace.editor.document.id}
            initial={workspace.editor}
            flushRef={workspace.flushRef}
          />
        ) : (
          <EmptyWorkspace ready={Boolean(workspace.snapshot)} />
        )}
      </div>
      <footer>
        <span role="status" data-testid="workspace-status">
          {workspace.closing
            ? "입력을 저장하고 종료하는 중…"
            : workspace.busy
              ? "문서를 여는 중…"
              : workspace.snapshot
                ? "작업 공간 준비됨"
                : "작업 공간을 여는 중…"}
        </span>
        <span>승인한 변경만 확정본에 반영됩니다.</span>
      </footer>
    </div>
  );
}

function EmptyWorkspace({ ready }: { ready: boolean }) {
  return (
    <main className="empty-state">
      <div className="document-icon" aria-hidden="true">
        ≡
      </div>
      <h1>문서를 다듬는 나만의 작업 공간</h1>
      <p>Markdown 원문을 편집하고, AI가 제안한 변경을 검토하세요.</p>
      <p className="muted">
        {ready
          ? "문서를 열거나 새 문서를 만들어 시작하세요."
          : "작업 공간을 준비하고 있습니다."}
      </p>
    </main>
  );
}

function Sidebar({
  workspace,
}: {
  workspace: ReturnType<typeof useWorkspace>;
}) {
  return (
    <aside className="sidebar" aria-label="문서 목록" inert={workspace.closing}>
      <h2>문서</h2>
      <DocumentActions workspace={workspace} />
      <ConnectionSettings />
      <ul>
        {workspace.snapshot?.documents.map((document) => (
          <li key={document.id}>
            <button
              type="button"
              disabled={workspace.busy}
              aria-current={
                document.id === workspace.editor?.document.id
                  ? "page"
                  : undefined
              }
              onClick={() => {
                void workspace.navigate(document.id);
              }}
            >
              {document.title}
            </button>
          </li>
        ))}
      </ul>
      <div className="local-badge">로컬 작업 공간</div>
    </aside>
  );
}

function DocumentActions({
  workspace,
}: {
  workspace: ReturnType<typeof useWorkspace>;
}) {
  return (
    <div className="document-actions">
      <button
        type="button"
        disabled={workspace.busy}
        onClick={() => {
          void workspace.navigate(false);
        }}
      >
        문서 열기
      </button>
      <button
        type="button"
        disabled={workspace.busy}
        onClick={() => {
          void workspace.navigate(true);
        }}
      >
        새 문서
      </button>
    </div>
  );
}
