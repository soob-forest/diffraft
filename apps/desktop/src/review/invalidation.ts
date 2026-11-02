import type { ReviewProjection } from "../generated/ReviewProjection";
import type { VersionSummary } from "../generated/VersionSummary";
export function invalidationReason(
  projection: ReviewProjection,
  versions: VersionSummary[],
) {
  if (projection.currentHeadId === projection.batch.applyHeadId) return null;
  const baseline = versions.find(
    (version) => version.id === projection.batch.applyHeadId,
  );
  if (!baseline) return null;
  const changed = versions.find(
    (version) => version.number === baseline.number + 1,
  );
  if (!changed) return null;
  const reasons: Record<string, string> = {
    edit: "원문 직접 편집으로 기준이 바뀌었습니다.",
    accept: "다른 제안의 승인으로 기준이 바뀌었습니다.",
    rewrite: "전체 재작성 적용으로 기준이 바뀌었습니다.",
    restore: "버전 복원으로 기준이 바뀌었습니다.",
    external: "외부 파일 수용으로 기준이 바뀌었습니다.",
    merge: "수동 통합으로 기준이 바뀌었습니다.",
  };
  return reasons[changed.reason] ?? null;
}
