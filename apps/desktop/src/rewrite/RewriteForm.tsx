import { useEffect, useRef, useState } from "react";
import { useDraftPersistence } from "../drafts/SessionDrafts";
import { useReviewSurface } from "../editor/WorkspacePanels";
import { chooseRequestTarget, requestKey } from "../generation/request-targets";
import { errorMessage } from "../ipc";
import type { RewriteFormProps } from "./useRewriteGeneration";

export function RewriteForm(
  props: RewriteFormProps & { openRequest?: number; visible?: boolean },
) {
  const { open, error, canReference } = useRewriteEntry(props);
  return (
    <section className="rewrite-entry">
      <h4>새 전체 초안</h4>
      <button
        type="button"
        disabled={props.review.state.generating}
        onClick={() => void open(false)}
      >
        확정본 전체에서 새 초안 요청
      </button>
      {canReference && (
        <button
          type="button"
          disabled={props.review.state.generating}
          onClick={() => void open(true)}
        >
          이 후보를 참고해 다른 방향 만들기
        </button>
      )}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}

function useRewriteEntry(props: RewriteFormProps & { openRequest?: number }) {
  const drafts = useDraftPersistence(),
    surface = useReviewSurface();
  const [error, setError] = useState("");
  const handled = useRef(0),
    lock = useRef(false);
  const activeOwner = useRef("");
  const owner = JSON.stringify([props.model.state.document.id, props.taskId]);
  activeOwner.current = owner;
  useEffect(() => {
    activeOwner.current = owner;
    return () => {
      activeOwner.current = "";
    };
  }, [owner]);
  const batch = props.review.projection?.batch;
  const canReference =
    batch?.mode === "REWRITE" &&
    batch.reviewMode === "WHOLE" &&
    ["ACTIVE", "ARCHIVED"].includes(batch.status) &&
    batch.baseVersionId === props.model.autosave.document.versionId;
  const open = async (reference: boolean) => {
    if (lock.current) return;
    lock.current = true;
    setError("");
    try {
      await drafts.flush();
      if (activeOwner.current !== owner) return;
      selectRewriteDraft(drafts, props, reference ? batch?.id : undefined);
      await drafts.flush();
      if (activeOwner.current === owner) surface?.showRequest();
    } catch (reason) {
      if (activeOwner.current === owner) setError(errorMessage(reason));
    } finally {
      lock.current = false;
    }
  };
  useEffect(() => {
    if (props.openRequest && handled.current !== props.openRequest) {
      handled.current = props.openRequest;
      void open(false);
    }
  });
  return { open, error, canReference };
}

function selectRewriteDraft(
  drafts: ReturnType<typeof useDraftPersistence>,
  props: RewriteFormProps,
  referenceBatchId: string | undefined,
) {
  const key = requestKey(props.model.state.document.id, props.taskId);
  const next = chooseRequestTarget(
    drafts.store,
    key,
    { question: undefined, referenceBatchId },
    "REWRITE",
  );
  const legacyKey = JSON.stringify([
    "rewrite",
    props.model.state.document.id,
    props.taskId,
  ]);
  const legacy = drafts.store.peek(legacyKey) as
    | { instruction?: string }
    | undefined;
  if (!next.instruction && legacy?.instruction)
    drafts.store.write(key, { ...next, instruction: legacy.instruction });
}
