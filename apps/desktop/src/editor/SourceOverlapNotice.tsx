import { useEffect, useState } from "react";
import type { ConversationResult } from "../generated/ConversationResult";
import type { TaskSnapshot } from "../generated/TaskSnapshot";
import { errorMessage } from "../ipc";
import type { SelectedTarget } from "../review/selection-targets";
import { readSourceOverlaps, type SourceOverlap } from "./source-overlaps";

export function useSourceOverlaps(
  tasks: TaskSnapshot[],
  target: SelectedTarget | null,
) {
  const [state, setState] = useState<{
    target: SelectedTarget | null;
    matches: SourceOverlap[];
    error: string;
  }>({ target: null, matches: [], error: "" });
  useEffect(() => {
    let active = true;
    if (target?.kind !== "confirmed") return;
    void readSourceOverlaps(tasks, target).then(
      (matches) => {
        if (active) setState({ target, matches, error: "" });
      },
      (reason) => {
        if (active)
          setState({ target, matches: [], error: errorMessage(reason) });
      },
    );
    return () => {
      active = false;
    };
  }, [tasks, target]);
  return {
    ...state,
    loading: Boolean(target && target !== state.target),
    blocked:
      Boolean(target && target !== state.target) ||
      Boolean(state.error) ||
      state.matches.length > 0,
  };
}
export function SourceOverlapNotice({
  state,
  open,
}: {
  state: ReturnType<typeof useSourceOverlaps>;
  open: (taskId: string, result: ConversationResult) => void;
}) {
  if (state.loading)
    return <p role="status">선택 범위와 기존 제안을 확인 중…</p>;
  if (state.error)
    return <p role="alert">기존 제안을 확인하지 못했습니다: {state.error}</p>;
  if (!state.matches.length) return null;
  return (
    <aside className="source-overlap" aria-label="선택과 겹치는 제안">
      <p>
        미승인 제안과 겹칩니다. 검토할 제안을 선택해 후보에서 수정할 부분을 다시
        선택하세요. 현재 지시는 보관됩니다.
      </p>
      {state.matches.map((match) => (
        <button
          key={`${match.batchId}:${match.proposalId}`}
          type="button"
          onClick={() =>
            open(match.taskId, {
              batchId: match.batchId,
              proposalId: match.proposalId,
              revision: match.revision,
              status: "PENDING",
            })
          }
        >
          {match.goal} · 겹치는 제안 검토
        </button>
      ))}
    </aside>
  );
}
