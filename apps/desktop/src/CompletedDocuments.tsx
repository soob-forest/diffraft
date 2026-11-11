import type { useWorkspace } from "./workspace";

type Props = { workspace: ReturnType<typeof useWorkspace> };
export function CompletedDocuments({ workspace }: Props) {
  return (
    <details className="completed-documents">
      <summary>완료한 문서 · {workspace.completed.length}개</summary>
      {workspace.completed.length ? (
        <ul>
          {workspace.completed.map((entry) => (
            <li key={entry.id}>
              <button
                type="button"
                disabled={workspace.busy}
                aria-label={`${entry.title} 다시 열기`}
                onClick={(event) =>
                  void restoreDocument(workspace, entry.id, event.currentTarget)
                }
              >
                <span className="completed-document-title">{entry.title}</span>
                <span>다시 열기</span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p>완료한 문서가 없습니다.</p>
      )}
    </details>
  );
}

async function restoreDocument(
  workspace: Props["workspace"],
  id: string,
  trigger: HTMLButtonElement,
) {
  await workspace.navigate(id);
  requestAnimationFrame(() => {
    if (trigger.isConnected) return;
    const source = document.querySelector<HTMLElement>(
      ".source-editor .cm-content",
    );
    const target = source?.getClientRects().length
      ? source
      : document.querySelector<HTMLElement>(".workspace-controls button");
    target?.focus();
  });
}
