import { useEffect, useMemo, useRef, useState } from "react";
import type { ReviewProjection } from "../generated/ReviewProjection";
import type { TaskReview } from "../generated/TaskReview";
import { errorMessage } from "../ipc";
import { reviewCommand } from "./api";
import { ReadSequence, reviewFingerprint } from "./state";

const REFRESH_MS = 1000;
type Snapshot = { state: TaskReview; projection: ReviewProjection | null };
const empty: Snapshot = {
  state: { batches: [], comments: [], generating: false, sequence: 0 },
  projection: null,
};
export function useReview(taskId: string, headId: string) {
  const [snapshot, setSnapshot] = useState(empty);
  const [batchId, setBatchId] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  const sequence = useRef(new ReadSequence());
  const request = useMemo(
    () => ({ taskId, batchId, headId, revision }),
    [taskId, batchId, headId, revision],
  );
  useEffect(() => {
    return pollReview(request, sequence.current, {
      setSnapshot,
      setError,
      setLoading,
    });
  }, [request]);
  return {
    ...snapshot,
    error,
    loading,
    batchId,
    setBatchId: (value: string) => {
      sequence.current.invalidate();
      setLoading(true);
      setBatchId(value);
    },
    refresh: () => {
      sequence.current.invalidate();
      setRevision((value) => value + 1);
    },
  };
}
async function load(
  taskId: string,
  requested: string,
  headId: string,
): Promise<Snapshot> {
  if (!taskId) return empty;
  const state = await reviewCommand({ kind: "state", taskId }, "state");
  const batch =
    state.batches.find((value) => value.id === requested) ??
    state.batches.find((value) => value.status === "ACTIVE") ??
    state.batches[0];
  const projection = batch
    ? await reviewCommand(
        { kind: "projection", batchId: batch.id, expectedHeadId: headId },
        "projection",
      )
    : null;
  return { state, projection };
}
function retainProjection(previous: Snapshot, next: Snapshot): Snapshot {
  if (
    reviewFingerprint(previous.projection) ===
    reviewFingerprint(next.projection)
  )
    return { ...next, projection: previous.projection };
  return next;
}
export type ReviewModel = ReturnType<typeof useReview>;

type ReadRequest = {
  taskId: string;
  batchId: string;
  headId: string;
  revision: number;
};
function pollReview(
  request: ReadRequest,
  sequence: ReadSequence,
  callbacks: {
    setSnapshot: React.Dispatch<React.SetStateAction<Snapshot>>;
    setError: (value: string) => void;
    setLoading: (value: boolean) => void;
  },
) {
  const { setSnapshot, setError, setLoading } = callbacks;
  let running = false;
  const refresh = async () => {
    if (running) return;
    running = true;
    const ticket = sequence.begin();
    try {
      const result = await load(
        request.taskId,
        request.batchId,
        request.headId,
      );
      if (sequence.current(ticket)) {
        setSnapshot((previous) => retainProjection(previous, result));
        setError("");
        setLoading(false);
      }
    } catch (reason) {
      if (sequence.current(ticket)) {
        setError(errorMessage(reason));
        setLoading(false);
      }
    } finally {
      running = false;
    }
  };
  setLoading(true);
  void refresh();
  const timer = setInterval(() => {
    void refresh();
  }, REFRESH_MS);
  return () => {
    clearInterval(timer);
    sequence.invalidate();
  };
}
