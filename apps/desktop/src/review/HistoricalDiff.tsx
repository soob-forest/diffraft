import { ComparisonViewer } from "./ComparisonViewer";
import type { useHistory } from "./useHistory";

export function HistoricalDiff({
  history,
}: {
  history: ReturnType<typeof useHistory>;
}) {
  if (!history.target) return null;
  return (
    <section className="historical-diff" aria-label="이전 제안 읽기 전용 비교">
      <div className="review-message">
        <strong>이전 제안 · r{history.target.revision} · 읽기 전용</strong>
        <p>
          {history.target.previousRevision
            ? `이전 후보 r${history.target.previousRevision}와 비교`
            : "제안 당시 기준 원문과 비교"}{" "}
          · 이 화면에서는 승인하지 않습니다.
        </p>
        <button type="button" onClick={history.close}>
          검토로 돌아가기
        </button>
      </div>
      {history.error && <p role="alert">{history.error}</p>}
      {!history.value && !history.error && (
        <p role="status">당시 후보 불러오는 중…</p>
      )}
      {history.value && (
        <ComparisonViewer
          comparison={history.value}
          labels={[
            history.target.previousRevision ? "이전 후보" : "당시 변경 전",
            "당시 후보",
          ]}
          header={
            <span>
              {history.value.proposal.operation.headingPath.join(" › ") ||
                "문서"}
            </span>
          }
        />
      )}
    </section>
  );
}
