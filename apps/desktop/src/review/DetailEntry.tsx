import { useEffect, useState } from "react";
import { useReviewSurface } from "../editor/WorkspacePanels";

export function DetailEntry() {
  const surface = useReviewSurface();
  const [requested, setRequested] = useState(false);
  const detail = surface?.detail;
  const visible = surface?.detailVisible;
  useEffect(() => {
    if (!requested || !visible || !detail) return;
    const frame = requestAnimationFrame(() => {
      detail.querySelector<HTMLElement>(".comment-entry")?.focus();
      setRequested(false);
    });
    return () => cancelAnimationFrame(frame);
  }, [requested, visible, detail]);
  return (
    <button
      className="detail-entry"
      type="button"
      onClick={() => {
        setRequested(true);
        surface?.showDetail();
      }}
    >
      변경 상세·코멘트
    </button>
  );
}
