import { useEffect, useState } from "react";
import type { ConversationResult } from "../generated/ConversationResult";
import type { ProposalComparison } from "../generated/ProposalComparison";
import { errorMessage } from "../ipc";
import { reviewCommand } from "./api";
import { isCurrentResult } from "./result-destination";

export type HistoryTarget = {
  batchId: string;
  proposalId: string;
  revision: number;
  previousRevision: number | null;
};
export function useHistory(requested?: ConversationResult | null) {
  const [target, setTarget] = useState<HistoryTarget | null>(null);
  const [value, setValue] = useState<ProposalComparison | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    if (
      requested?.proposalId &&
      requested.revision &&
      !isCurrentResult(requested)
    )
      setTarget({
        batchId: requested.batchId,
        proposalId: requested.proposalId,
        revision: requested.revision,
        previousRevision: null,
      });
    else setTarget(null);
  }, [requested]);
  useEffect(() => {
    let active = true;
    setValue(null);
    setError("");
    if (target)
      reviewCommand({ kind: "historical", ...target }, "historical").then(
        (next) => {
          if (active) setValue(next);
        },
        (reason: unknown) => {
          if (active) setError(errorMessage(reason));
        },
      );
    return () => {
      active = false;
    };
  }, [target]);
  return {
    target,
    value,
    error,
    open: setTarget,
    close: () => setTarget(null),
  };
}
