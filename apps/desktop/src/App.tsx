import { useEffect, useState } from "react";
import { AppAbout } from "./AppAbout";
import { ConnectionSettings } from "./connection/ConnectionSettings";
import { GenerationStatus } from "./connection/GenerationStatus";
import { DocumentSidebar } from "./DocumentSidebar";
import { DraftStatus, SessionDrafts } from "./drafts/SessionDrafts";
import { DocumentWorkspace } from "./editor/DocumentWorkspace";
import { NavigationProvider } from "./editor/NavigationSlots";
import { usePanelWidth } from "./panels/PanelResize";
import {
  useWorkspacePanels,
  type WorkspacePanelControl,
} from "./panels/useWorkspacePanels";
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
  const [documentsWidth, setDocumentsWidth] = usePanelWidth("documents");
  const panels = useWorkspacePanels();
  return (
    <div
      className="app-shell"
      data-documents-open={documentsOpen}
      style={
        { "--documents-width": `${documentsWidth}px` } as React.CSSProperties
      }
    >
      <AppHeader
        workspace={workspace}
        documentsOpen={documentsOpen}
        setDocumentsOpen={setDocumentsOpen}
      />
      <DocumentSidebar
        workspace={workspace}
        width={documentsWidth}
        setWidth={setDocumentsWidth}
        close={() => {
          setDocumentsOpen(false);
          requestAnimationFrame(() =>
            document
              .querySelector<HTMLButtonElement>(
                '.app-header button[aria-controls="document-list"]',
              )
              ?.focus(),
          );
        }}
      />
      <WorkspaceContent
        workspace={workspace}
        panels={panels}
        documents={{
          open: documentsOpen,
          toggle: () => setDocumentsOpen((value) => !value),
        }}
      />
      <WorkspaceFooter workspace={workspace} />
    </div>
  );
}

function WorkspaceContent({
  workspace,
  documents,
  panels,
}: {
  workspace: ReturnType<typeof useWorkspace>;
  documents: { open: boolean; toggle: () => void };
  panels: WorkspacePanelControl;
}) {
  return (
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
          documents={documents}
          panels={panels}
        />
      ) : (
        <EmptyWorkspace ready={Boolean(workspace.snapshot)} />
      )}
    </div>
  );
}

function AppHeader({
  workspace,
  documentsOpen,
  setDocumentsOpen,
}: {
  workspace: ReturnType<typeof useWorkspace>;
  documentsOpen: boolean;
  setDocumentsOpen: React.Dispatch<React.SetStateAction<boolean>>;
}) {
  return (
    <header className="app-header" inert={workspace.closing}>
      <span className="brand-icon">D</span>
      <AppAbout />
      <span>내 작업 공간</span>
      <button
        type="button"
        aria-expanded={documentsOpen}
        aria-controls="document-list"
        onClick={() => setDocumentsOpen((value) => !value)}
      >
        문서 목록
      </button>
      <GenerationStatus />
      <div className="app-settings">
        <ConnectionSettings icon />
      </div>
    </header>
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
      <DraftStatus recovery />
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
