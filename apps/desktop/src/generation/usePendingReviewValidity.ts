import { useEffect } from "react";
import { errorMessage } from "../ipc";
import { reviewCommand } from "../review/api";
import type { useReview } from "../review/useReview";
import type { PendingRequest } from "./request";
import { pendingReviewChanged } from "./request-validity";

type Props = {
  taskId: string;
  pending: PendingRequest | null;
  review: ReturnType<typeof useReview>;
  close: () => void;
  report: (message: string) => void;
};
export function usePendingReviewValidity({
  taskId,
  pending,
  review,
  close,
  report,
}: Props) {
  const active =
    review.state.batches.find((batch) => batch.status === "ACTIVE")?.id ?? null;
  useEffect(() => {
    if (
      !pending ||
      review.loading ||
      !pendingReviewChanged(pending, review.state.sequence, active)
    )
      return;
    let current = true;
    const verify = async () => {
      try {
        const fresh = await reviewCommand({ kind: "state", taskId }, "state");
        const batch =
          fresh.batches.find((value) => value.status === "ACTIVE")?.id ?? null;
        if (current && pendingReviewChanged(pending, fresh.sequence, batch)) {
          close();
          report("검토 내용이 바뀌었습니다. 요청 내용을 다시 확인해 주세요.");
        }
      } catch (reason) {
        if (!current) return;
        close();
        report(
          `검토 상태를 확인하지 못했습니다. ${errorMessage(reason)} 요청 내용을 다시 확인해 주세요.`,
        );
      }
    };
    void verify();
    return () => {
      current = false;
    };
  }, [
    taskId,
    pending,
    review.loading,
    review.state.sequence,
    active,
    close,
    report,
  ]);
}
