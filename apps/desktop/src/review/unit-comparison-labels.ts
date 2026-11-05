import type { ReviewProjection } from "../generated/ReviewProjection";
import type { VersionSummary } from "../generated/VersionSummary";

export function unitComparisonLabels(
  projection: ReviewProjection,
  versions: VersionSummary[],
  original: boolean,
): [string, string] {
  const historical = original || projection.batch.status !== "ACTIVE";
  const versionId = historical
    ? projection.batch.baseVersionId
    : projection.currentHeadId;
  const number = versions.find((version) => version.id === versionId)?.number;
  const version = number === undefined ? "버전 미상 · 확인 필요" : `v${number}`;
  return historical
    ? [`당시 기준본 · ${version}`, "원래 전체 후보 · 읽기 전용"]
    : [`현재 확정본 · ${version}`, "제안 반영 예상본 · 미승인 포함"];
}
