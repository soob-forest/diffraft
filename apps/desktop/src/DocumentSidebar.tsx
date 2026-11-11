import { CompletedDocuments } from "./CompletedDocuments";
import { DocumentItem } from "./documents/DocumentItem";
import { DocumentMenus } from "./documents/DocumentMenus";
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
    <DocumentMenus workspace={workspace}>
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
          문서 옆 더보기 또는 우클릭으로 완료 상태를 바꿀 수 있습니다.
        </p>
        <RemovalNotice workspace={workspace} />
        <DocumentRows workspace={workspace} />
        <CompletedDocuments workspace={workspace} />
        <PanelResize
          kind="documents"
          controls="document-list"
          value={width}
          onChange={setWidth}
        />
      </aside>
    </DocumentMenus>
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
      <span>{removed.title} 문서를 완료 목록으로 이동했습니다.</span>
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
        <DocumentItem key={document.id} document={document} />
      ))}
    </ul>
  );
}
