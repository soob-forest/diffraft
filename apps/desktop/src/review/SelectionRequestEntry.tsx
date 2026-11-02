import { useReviewSurface } from "../editor/WorkspacePanels";
import { selectedCommentProposal } from "./selection-comment";
import type { Panel } from "./useReviewPanel";

export function SelectionRequestEntry({ panel }: { panel: Panel }) {
  const surface = useReviewSurface();
  const selected = panel.selection && panel.selection.from < panel.selection.to;
  const comment =
    panel.review.projection && panel.selection
      ? selectedCommentProposal(panel.review.projection, panel.selection)
      : null;
  if (!panel.selection && !panel.selectionIssue) return null;
  return (
    <div className="selection-request-entry">
      {selected && (
        <button
          type="button"
          className="primary selection-primary"
          disabled={panel.blocked}
          onClick={() => {
            panel.startSelectedRequest();
            surface?.showDetail();
          }}
        >
          이 부분 수정
        </button>
      )}
      {comment && (
        <button
          type="button"
          disabled={panel.blocked}
          onClick={() => {
            panel.openDetail("comment", comment);
            surface?.showDetail();
          }}
        >
          코멘트
        </button>
      )}
      {panel.selection?.side === "after" && (
        <details className="selection-more">
          <summary aria-label="선택 범위 확장">더보기</summary>
          <button
            data-keep-popover
            type="button"
            disabled={panel.blocked}
            onClick={() => panel.expandSelection("sentence")}
          >
            이 문장 선택
          </button>
          <button
            data-keep-popover
            type="button"
            disabled={panel.blocked}
            onClick={() => panel.expandSelection("paragraph")}
          >
            이 문단 선택
          </button>
        </details>
      )}
      {panel.selectionIssue && <p role="status">{panel.selectionIssue}</p>}
      {panel.selectedRequest.message && (
        <p role="status">{panel.selectedRequest.message}</p>
      )}
    </div>
  );
}
