import { useEffect, useState } from "react";
import type { ReviewImpact } from "../generated/ReviewImpact";
import { errorMessage } from "../ipc";
import { reviewCommand } from "../review/api";

const POLL_MS = 1000;
export function SourceImpact({
  documentId,
  onReview,
}: {
  documentId: string;
  onReview: (taskId: string) => void;
}) {
  const { impact, error } = useReviewImpact(documentId);
  if (error)
    return (
      <p role="status" className="review-message">
        검토 영향 확인 실패: {error}
      </p>
    );
  if (!impact || (!impact.proposals && !impact.rewrites)) return null;
  return (
    <aside className="source-impact review-message" aria-label="원문 편집 영향">
      <strong>
        원문을 저장하면 남은 제안은 최신 기준으로 다시 요청해야 합니다.
      </strong>
      <p>
        이 문서의 모든 작업 · 미승인 제안 {impact.proposals}개 / 승인 그룹{" "}
        {impact.groups}개
        {impact.rewrites ? ` · 전체 재작성 후보 ${impact.rewrites}개` : ""}.
        제안 표현만 바꾸려면 변경 검토에서 후보를 수정하세요.
      </p>
      <button
        type="button"
        onClick={() => {
          if (impact.firstTaskId) onReview(impact.firstTaskId);
        }}
      >
        작업·검토 열기
      </button>
    </aside>
  );
}

function useReviewImpact(documentId: string) {
  const [impact, setImpact] = useState<ReviewImpact | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    let running = false;
    const read = async () => {
      if (running) return;
      running = true;
      try {
        const value = await reviewCommand(
          { kind: "impact", documentId },
          "impact",
        );
        if (active) {
          setImpact(value);
          setError("");
        }
      } catch (reason) {
        if (active) setError(errorMessage(reason));
      } finally {
        running = false;
      }
    };
    void read();
    const timer = setInterval(() => void read(), POLL_MS);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [documentId]);
  return { impact, error };
}
