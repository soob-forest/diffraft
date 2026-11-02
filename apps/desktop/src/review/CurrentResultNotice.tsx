import { useState } from "react";
import type { ConversationResult } from "../generated/ConversationResult";
import type { ReviewProjection } from "../generated/ReviewProjection";
import { currentResultGroup, isNewResult } from "./result-destination";

export function CurrentResultNotice({
  result,
  projection,
}: {
  result: ConversationResult | null;
  projection: ReviewProjection | null;
}) {
  const [dismissed, setDismissed] = useState<ConversationResult | null>(null);
  if (
    !result ||
    dismissed === result ||
    !isNewResult(result) ||
    !projection ||
    !currentResultGroup(projection, result)
  )
    return null;
  return (
    <aside role="status" className="review-message current-result-notice">
      <strong>생성 완료 · 새 미승인 제안</strong>
      <p>
        선택한 원문의 부분 제안을 만들었습니다. 기존 제안은 유지되며 확정본
        반영은 별도 승인으로 진행합니다.
      </p>
      <button type="button" onClick={() => setDismissed(result)}>
        안내 닫기
      </button>
    </aside>
  );
}
