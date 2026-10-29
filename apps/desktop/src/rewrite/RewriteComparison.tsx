import type { ReviewProjection } from "../generated/ReviewProjection";
import type { VersionSummary } from "../generated/VersionSummary";
import { ComparisonViewer } from "../review/ComparisonViewer";
import { ReviewHeader } from "../review/ReviewContent";
import type { ReviewModel } from "../review/useReview";

export function RewriteComparison({
  comparison,
  review,
  versions,
}: {
  comparison: ReviewProjection;
  review: ReviewModel;
  versions: VersionSummary[];
}) {
  const current = versions.find(
    (version) => version.id === comparison.currentHeadId,
  )?.number;
  const base = versions.find(
    (version) => version.id === comparison.batch.baseVersionId,
  )?.number;
  const candidate =
    review.state.batches.length -
    review.state.batches.findIndex((batch) => batch.id === comparison.batch.id);
  return (
    <>
      <header className="rewrite-comparison-heading">
        <h3>
          현재 확정본 v{current ?? "확인 필요"} → 재작성 후보 {candidate}
        </h3>
        <p>
          기준 v{base ?? "확인 필요"} · {comparison.batch.summary}
        </p>
        <p>
          후보 전체를 비교합니다. 적용 확인 전에는 확정본을 바꾸지 않습니다.
        </p>
      </header>
      <ComparisonViewer
        comparison={comparison}
        header={<ReviewHeader review={review} />}
        labels={[
          `확정본 v${current ?? "확인 필요"}`,
          `재작성 후보 ${candidate}`,
        ]}
      />
    </>
  );
}
