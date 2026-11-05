import { type RefObject, useEffect, useState } from "react";
import type { ReviewUnit } from "../generated/ReviewUnit";
import { reopenedUnitView, reopenSelectionState } from "./unit-review-model";
import type { Panel } from "./useReviewPanel";
import type { UnitNavigation } from "./useUnitNavigation";
import { useUnitReopen } from "./useUnitReopen";

export function useReopenedNavigation(
  panel: Panel,
  navigation: UnitNavigation,
  title: RefObject<HTMLHeadingElement | null>,
) {
  const [intent, setIntent] = useState<ReviewUnit | null>(null);
  const reopen = useUnitReopen(panel, setIntent);
  const projection = panel.review.projection;
  useEffect(() => {
    if (!intent || !projection || panel.review.loading) return;
    if (reopenSelectionState(projection.batch, intent) === "changed") {
      setIntent(null);
      panel.actions.setMessage(
        "다른 창에서 검토 상태가 바뀌었습니다. 최신 변경과 처리 기록을 확인해 주세요.",
        "attention",
      );
      return;
    }
    const next = reopenedUnitView(projection.batch, intent);
    if (!next) return;
    navigation.update(next);
    navigation.locate(next.selectedId, projection, false);
    setIntent(null);
    requestAnimationFrame(() => title.current?.focus());
  }, [
    intent,
    projection,
    navigation,
    panel.review.loading,
    panel.actions.setMessage,
    title,
  ]);
  return { ...reopen, busy: reopen.busy || !!intent };
}
