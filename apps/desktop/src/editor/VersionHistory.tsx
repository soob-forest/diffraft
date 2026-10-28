import { useRef } from "react";
import { RestoreDialog } from "../history/RestoreDialog";
import { useHistory } from "../history/useHistory";
import type { DocumentModel as Model } from "./useDocument";

const reasons: Record<string, string> = {
  opened: "문서 열기",
  edit: "원문 편집",
  accept: "제안 승인",
  rewrite: "전체 재작성 적용",
  restore: "버전 복원",
  external: "외부 파일 사용",
  merge: "수동 통합",
};

export function VersionHistory({ model }: { model: Model }) {
  const history = useHistory(model);
  const returnFocus = useRef<HTMLButtonElement>(null);
  return (
    <>
      <details className="version-history">
        <summary>버전 기록 · {model.state.versions.length}개</summary>
        <ol>
          {model.state.versions.map((version) => (
            <li key={version.id}>
              <strong>v{version.number}</strong>
              <span>{reasons[version.reason] ?? version.reason}</span>
              <time dateTime={new Date(version.createdAt).toISOString()}>
                {new Date(version.createdAt).toLocaleString("ko-KR")}
              </time>
              <button
                type="button"
                disabled={
                  history.busy ||
                  version.id === model.autosave.document.versionId
                }
                onClick={(event) => {
                  returnFocus.current = event.currentTarget;
                  void history.compare(version.id);
                }}
              >
                v{version.number} 비교·복원
              </button>
            </li>
          ))}
        </ol>
        {history.message && <p role="status">{history.message}</p>}
      </details>
      {history.selected && (
        <RestoreDialog history={history} returnFocus={returnFocus} />
      )}
    </>
  );
}
