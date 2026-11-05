import { useEffect, useRef, useState } from "react";
import type { DocumentModel } from "../editor/useDocument";
import type { StartRewriteReview } from "../generated/StartRewriteReview";
import { errorMessage } from "../ipc";
import { reviewCommand } from "./api";
import { contentHash } from "./prepare-selected";
import type { Panel } from "./useReviewPanel";

export function RewriteReviewStart({
  document,
  panel,
}: {
  document: DocumentModel;
  panel: Panel;
}) {
  const form = useStartReview(document, panel);
  if (panel.review.projection?.batch.status !== "ACTIVE") return null;
  return (
    <div className="unit-review-start">
      <div>
        <strong>원하는 변경만 반영할 수 있습니다</strong>
        <p>
          문단과 연결된 변경을 나눠 검토합니다. 승인 전에는 원문을 바꾸지
          않습니다.
        </p>
      </div>
      <button
        type="button"
        className="primary"
        disabled={panel.blocked || form.busy}
        onClick={() => void form.start()}
      >
        {form.busy ? "검토 준비 중…" : "변경별 검토 시작"}
      </button>
      {form.error && <p role="alert">{form.error}</p>}
    </div>
  );
}

function useStartReview(document: DocumentModel, panel: Panel) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const pending = useRef<StartRewriteReview | null>(null),
    lock = useRef(false),
    active = useRef(true);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  const start = async () => {
    const projection = panel.review.projection;
    if (!projection || lock.current || panel.blocked) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      await document.autosave.flush();
      const candidateHash = await contentHash(
        projection.batch.candidateMarkdown ?? "",
      );
      if (
        !pending.current ||
        pending.current.batchId !== projection.batch.id ||
        pending.current.expectedHeadId !== projection.currentHeadId ||
        pending.current.candidateHash !== candidateHash
      )
        pending.current = {
          documentId: projection.batch.documentId,
          batchId: projection.batch.id,
          expectedHeadId: projection.currentHeadId,
          candidateHash,
          operationId: crypto.randomUUID(),
        };
      const request = pending.current;
      await document.gate.run(() =>
        reviewCommand({ kind: "start_rewrite_review", request }, "batch"),
      );
      if (active.current) panel.review.refresh();
    } catch (reason) {
      if (active.current) setError(errorMessage(reason));
    } finally {
      lock.current = false;
      if (active.current) setBusy(false);
    }
  };
  return { busy, error, start };
}
