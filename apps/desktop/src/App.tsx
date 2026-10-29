import { useEffect, useState } from "react";
import { ConnectionSettings } from "./connection/ConnectionSettings";
import { GenerationStatus } from "./connection/GenerationStatus";
import { SessionDrafts } from "./drafts/SessionDrafts";
import { DocumentWorkspace } from "./editor/DocumentWorkspace";
import { NavigationHosts, NavigationProvider } from "./editor/NavigationSlots";
import { useWorkspace } from "./workspace";

export function App() {
  return (
    <SessionDrafts>
      <NavigationProvider>
        <WorkspaceApp />
      </NavigationProvider>
    </SessionDrafts>
  );
}

function WorkspaceApp() {
  const workspace = useWorkspace();
  const [documentsOpen, setDocumentsOpen] = useDocumentList(
    workspace.editor?.document.id,
  );
  return (
    <div className="app-shell" data-documents-open={documentsOpen}>
      <header className="app-header" inert={workspace.closing}>
        <span className="brand-icon">D</span>
        <strong>DocReview</strong>
        <span>내 작업 공간</span>
        {!workspace.editor && (
          <button
            type="button"
            aria-expanded={documentsOpen}
            aria-controls="document-list"
            onClick={() => setDocumentsOpen((value) => !value)}
          >
            문서 목록
          </button>
        )}
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
            documents={{
              open: documentsOpen,
              toggle: () => setDocumentsOpen((value) => !value),
            }}
          />
        ) : (
          <EmptyWorkspace ready={Boolean(workspace.snapshot)} />
        )}
      </div>
      <WorkspaceFooter workspace={workspace} />
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
    <aside
      id="document-list"
      className="sidebar"
      aria-label="문서 목록"
      inert={workspace.closing}
    >
      <h2>문서</h2>
      <DocumentActions workspace={workspace} />
      <div className="sidebar-connection">
        <ConnectionSettings />
      </div>
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
      <details className="navigation-more">
        <summary>문서 탐색</summary>
        <NavigationHosts />
      </details>
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

function WorkspaceFooter({
  workspace,
}: {
  workspace: ReturnType<typeof useWorkspace>;
}) {
  return (
    <footer>
      <span role="status" data-testid="workspace-status">
        {workspace.closing
          ? "입력을 저장하고 종료하는 중…"
          : workspace.busy
            ? "문서를 여는 중…"
            : workspace.snapshot
              ? "로컬 작업 공간"
              : "작업 공간을 여는 중…"}
      </span>
      <span>승인한 변경만 확정본에 반영됩니다.</span>
    </footer>
  );
}

function useDocumentList(documentId: string | undefined) {
  const [open, setOpen] = useState(() => window.innerWidth > 1000);
  useEffect(() => {
    const query = window.matchMedia("(max-width: 1000px)");
    const collapse = () => {
      if (query.matches) setOpen(false);
    };
    collapse();
    query.addEventListener("change", collapse);
    return () => query.removeEventListener("change", collapse);
  }, []);
  useEffect(() => {
    if (documentId && window.innerWidth <= 1000) setOpen(false);
  }, [documentId]);
  return [open, setOpen] as const;
}
