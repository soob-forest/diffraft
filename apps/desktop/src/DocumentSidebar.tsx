import { CompletedDocuments } from "./CompletedDocuments";
import { NavigationHosts } from "./editor/NavigationSlots";
import { PanelResize } from "./panels/PanelResize";
import type { useWorkspace } from "./workspace";

type Props = {
  workspace: ReturnType<typeof useWorkspace>;
  close: () => void;
  width: number;
  setWidth: (value: number) => void;
};
export function DocumentSidebar({ workspace, close, width, setWidth }: Props) {
  return (
    <aside
      id="document-list"
      className="sidebar"
      aria-label="문서 목록"
      inert={workspace.closing}
    >
      <div className="sidebar-heading">
        <h2>문서</h2>
        <button type="button" aria-label="문서 목록 닫기" onClick={close}>
          닫기
        </button>
      </div>
      <DocumentActions workspace={workspace} />
      <p className="document-list-help">
        완료한 문서는 목록에서 제거할 수 있습니다. 파일과 기록은 보존됩니다.
      </p>
      <RemovalNotice workspace={workspace} />
      <DocumentRows workspace={workspace} />
      <CompletedDocuments workspace={workspace} />
      <details className="navigation-more">
        <summary>문서 탐색</summary>
        <NavigationHosts />
      </details>
      <PanelResize
        kind="documents"
        controls="document-list"
        value={width}
        onChange={setWidth}
      />
    </aside>
  );
}

function DocumentActions({ workspace }: Pick<Props, "workspace">) {
  return (
    <div className="document-actions">
      <button
        type="button"
        disabled={workspace.busy}
        onClick={() => void workspace.navigate(false)}
      >
        문서 열기
      </button>
      <button
        type="button"
        disabled={workspace.busy}
        onClick={() => void workspace.navigate(true)}
      >
        새 문서
      </button>
    </div>
  );
}
function RemovalNotice({ workspace }: Pick<Props, "workspace">) {
  const removed = workspace.removed;
  if (!removed) return null;
  return (
    <div className="document-removal-notice" role="status">
      <span>{removed.title} 문서를 목록에서 제거했습니다.</span>
      <button
        type="button"
        disabled={workspace.busy}
        onClick={() => void workspace.navigate(removed.id)}
      >
        다시 열기
      </button>
    </div>
  );
}

function DocumentRows({ workspace }: Pick<Props, "workspace">) {
  return (
    <ul>
      {workspace.snapshot?.documents.map((document) => (
        <DocumentRow
          key={document.id}
          workspace={workspace}
          document={document}
        />
      ))}
    </ul>
  );
}
function DocumentRow({
  workspace,
  document,
}: Pick<Props, "workspace"> & {
  document: import("./generated/DocumentSummary").DocumentSummary;
}) {
  return (
    <li key={document.id} className="document-list-row">
      <button
        type="button"
        disabled={workspace.busy}
        aria-current={
          document.id === workspace.editor?.document.id ? "page" : undefined
        }
        onClick={() => void workspace.navigate(document.id)}
      >
        {document.title}
      </button>
      <button
        type="button"
        className="document-remove"
        disabled={workspace.busy}
        aria-label={`${document.title} 목록에서 제거`}
        title="완료한 문서를 목록에서 제거 · 파일과 기록 보존"
        onClick={() => void workspace.remove(document)}
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          aria-hidden="true"
        >
          <path d="m6 12 4 4 8-8" />
        </svg>
      </button>
    </li>
  );
}
