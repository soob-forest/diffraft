import { useState } from "react";
import { useDraftPersistence } from "../drafts/SessionDrafts";
import { errorMessage } from "../ipc";
import type { GenerationProps } from "./request";
import {
  chooseRequestTarget,
  requestKey,
  savedRequestTargets,
} from "./request-targets";
import type { useGeneration } from "./useGeneration";
export function RequestTargets({
  props,
  form,
  blocked,
}: {
  props: GenerationProps;
  form: ReturnType<typeof useGeneration>;
  blocked: boolean;
}) {
  const { store } = useDraftPersistence();
  const [error, setError] = useState("");
  const key = requestKey(props.model.state.document.id, props.taskId);
  const choose = (
    target: Parameters<typeof chooseRequestTarget>[2],
    mode: Parameters<typeof chooseRequestTarget>[3],
  ) => {
    try {
      chooseRequestTarget(store, key, target, mode);
      setError("");
    } catch (reason) {
      setError(errorMessage(reason));
    }
  };
  const saved = savedRequestTargets(
    store,
    props.model.state.document.id,
    props.taskId,
  );
  return (
    <>
      {(form.question || form.referenceBatchId) && (
        <button
          type="button"
          disabled={blocked}
          onClick={() =>
            choose(
              { question: undefined, referenceBatchId: undefined },
              "PATCH",
            )
          }
        >
          확정본에서 새 요청
        </button>
      )}
      <SavedTargets saved={saved} choose={choose} blocked={blocked} />
      {error && <p role="alert">{error}</p>}
    </>
  );
}

function SavedTargets({
  saved,
  choose,
  blocked,
}: {
  saved: ReturnType<typeof savedRequestTargets>;
  choose: (
    target: Parameters<typeof chooseRequestTarget>[2],
    mode: Parameters<typeof chooseRequestTarget>[3],
  ) => void;
  blocked: boolean;
}) {
  if (!saved.length) return null;
  return (
    <details>
      <summary>다른 대상의 요청 초안</summary>
      {saved.map(({ key, value }) => (
        <button
          key={key}
          type="button"
          disabled={blocked}
          onClick={() =>
            choose(
              {
                question: value.question,
                referenceBatchId: value.referenceBatchId,
              },
              value.mode,
            )
          }
        >
          {value.question?.label ??
            (value.referenceBatchId ? "전체 후보 참고" : "확정본")}{" "}
          · {value.instruction.slice(0, 40) || "빈 초안"}
        </button>
      ))}
    </details>
  );
}
