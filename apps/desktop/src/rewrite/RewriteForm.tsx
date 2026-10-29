import { useEffect, useRef } from "react";
import { RewriteRequestDialog } from "./RewriteRequestDialog";
import {
  type RewriteFormProps,
  useRewriteGeneration,
} from "./useRewriteGeneration";

export function RewriteForm(
  props: RewriteFormProps & { openRequest?: number; visible?: boolean },
) {
  const details = useRef<HTMLDetailsElement>(null);
  const form = useRewriteGeneration(props);
  useRequestedFocus(
    details,
    props.openRequest,
    form.blocked,
    props.visible !== false,
  );
  const batch = props.review.projection?.batch;
  const canReference =
    batch?.mode === "REWRITE" &&
    (batch.status === "ACTIVE" || batch.status === "ARCHIVED") &&
    batch.baseVersionId === props.model.autosave.document.versionId;
  return (
    <details ref={details} className="rewrite-form proposal-details">
      <summary>전체 재작성·다른 방향 요청</summary>
      <p>
        현재 확정본 전체에서 새 후보를 만듭니다. 부분 제안은 확인 후 기록으로
        옮깁니다.
      </p>
      <label>
        재작성 지시
        <textarea
          rows={3}
          value={form.instruction}
          disabled={form.blocked}
          onChange={(event) => form.setInstruction(event.target.value)}
        />
      </label>
      <RequestButtons form={form} canReference={canReference} />
      <p role="status">{form.message}</p>
      {form.pending && (
        <RewriteRequestDialog
          form={form}
          version={props.model.status.version}
        />
      )}
    </details>
  );
}

function RequestButtons({
  form,
  canReference,
}: {
  form: ReturnType<typeof useRewriteGeneration>;
  canReference: boolean;
}) {
  return (
    <div className="proposal-actions">
      <button
        type="button"
        disabled={form.blocked || !form.instruction.trim()}
        onClick={() => void form.prepare(false)}
      >
        현재 확정본 재작성
      </button>
      {canReference && (
        <button
          type="button"
          disabled={form.blocked || !form.instruction.trim()}
          onClick={() => void form.prepare(true)}
        >
          이 후보의 다른 방향 요청
        </button>
      )}
    </div>
  );
}

function useRequestedFocus(
  details: React.RefObject<HTMLDetailsElement | null>,
  request: number | undefined,
  blocked: boolean,
  visible: boolean,
) {
  const focusedRequest = useRef(0);
  useEffect(() => {
    if (
      visible &&
      request &&
      request !== focusedRequest.current &&
      details.current
    ) {
      details.current.open = true;
      if (!blocked) {
        requestAnimationFrame(() => {
          const input = details.current?.querySelector("textarea");
          if (input?.isConnected && input.offsetParent && !input.disabled) {
            input.focus();
            focusedRequest.current = request;
          }
        });
      }
    }
  }, [request, blocked, details, visible]);
}
