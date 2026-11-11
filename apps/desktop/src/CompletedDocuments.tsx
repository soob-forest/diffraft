import { DocumentItem } from "./documents/DocumentItem";
import type { useWorkspace } from "./workspace";

type Props = { workspace: ReturnType<typeof useWorkspace> };
export function CompletedDocuments({ workspace }: Props) {
  return (
    <details className="completed-documents">
      <summary>완료한 문서 · {workspace.completed.length}개</summary>
      {workspace.completed.length ? (
        <ul>
          {workspace.completed.map((entry) => (
            <DocumentItem key={entry.id} document={entry} completed />
          ))}
        </ul>
      ) : (
        <p>완료한 문서가 없습니다.</p>
      )}
    </details>
  );
}
