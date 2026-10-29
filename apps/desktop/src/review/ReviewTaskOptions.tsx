import { useEffect, useRef } from "react";
import type { DocumentModel } from "../editor/useDocument";
import { useReviewSurface } from "../editor/WorkspacePanels";
import { BatchActions } from "../rewrite/BatchActions";
import { RewriteForm } from "../rewrite/RewriteForm";
import { TextDiff } from "./TextDiff";
import type { Panel } from "./useReviewPanel";

type Props = {
  panel: Panel;
  document: DocumentModel;
  taskId: string;
  flushTask: () => Promise<void>;
  rewriteRequest: number;
};
export function ReviewTaskOptions(props: Props) {
  const root = useRef<HTMLDetailsElement>(null);
  const surface = useReviewSurface();
  useEffect(() => {
    if (props.rewriteRequest && root.current) root.current.open = true;
  }, [props.rewriteRequest]);
  return (
    <details ref={root} className="review-task-options">
      <summary>작업 옵션</summary>
      {props.panel.review.projection && (
        <TextDiff hunks={props.panel.review.projection.hunks} />
      )}
      <RewriteForm
        model={props.document}
        review={props.panel.review}
        taskId={props.taskId}
        flushTask={props.flushTask}
        onBusy={props.panel.setRegenerating}
        visible={surface?.detailVisible}
        openRequest={props.rewriteRequest}
      />
      {props.panel.review.projection?.batch.mode === "PATCH" && (
        <BatchActions
          model={props.document}
          review={props.panel.review}
          blocked={props.panel.blocked}
        />
      )}
    </details>
  );
}
