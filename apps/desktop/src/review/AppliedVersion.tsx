import { useRef } from "react";
import type { DocumentModel } from "../editor/useDocument";
import { RestoreDialog } from "../history/RestoreDialog";
import { useHistory } from "../history/useHistory";

export function AppliedVersion({
  model,
  versionId,
}: {
  model: DocumentModel;
  versionId: string;
}) {
  const history = useHistory(model);
  const returnFocus = useRef<HTMLButtonElement>(null);
  return (
    <div className="applied-version">
      <div className="applied-notice">
        <span>제안 승인 완료 · 적용 전 내용과 비교할 수 있습니다.</span>
        <button
          ref={returnFocus}
          type="button"
          disabled={history.busy}
          onClick={() => void history.compare(versionId)}
        >
          이번 적용 전 버전 비교·복원
        </button>
      </div>
      <p>추가 편집이 있다면 복원 영향도 함께 확인합니다.</p>
      {history.message && <p role="status">{history.message}</p>}
      {history.selected && (
        <RestoreDialog history={history} returnFocus={returnFocus} />
      )}
    </div>
  );
}
