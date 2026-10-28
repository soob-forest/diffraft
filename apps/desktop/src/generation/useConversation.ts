import { useEffect, useRef, useState } from "react";
import { generationSnapshot } from "../connection/api";
import type { GenerationSnapshot } from "../generated/GenerationSnapshot";
import type { TaskConversation } from "../generated/TaskConversation";
import { errorMessage } from "../ipc";
import { taskConversation } from "./api";
import { mergeConversation } from "./state";

const REFRESH_MS = 1000;
export function useConversation(taskId: string) {
  const { page, setPage, generation, error, setError, active } =
    useConversationPolling(taskId);
  const [olderBusy, setOlderBusy] = useState(false);
  const older = async () => {
    if (!page?.earlierBefore || olderBusy) return;
    setOlderBusy(true);
    try {
      const next = await taskConversation(taskId, page.earlierBefore);
      if (active.current)
        setPage((current) =>
          current
            ? {
                ...mergeConversation(next, current),
                earlierBefore: next.earlierBefore,
              }
            : next,
        );
    } catch (reason) {
      if (active.current) setError(errorMessage(reason));
    } finally {
      if (active.current) setOlderBusy(false);
    }
  };
  return { page, generation, error, older, olderBusy };
}

function useConversationPolling(taskId: string) {
  const [page, setPage] = useState<TaskConversation | null>(null);
  const [generation, setGeneration] = useState<GenerationSnapshot | null>(null);
  const [error, setError] = useState("");
  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    let current = true;
    let running = false;
    const refresh = async () => {
      if (running) return;
      running = true;
      try {
        const [next, status] = await Promise.all([
          taskConversation(taskId),
          generationSnapshot(),
        ]);
        if (current) {
          setPage((previous) => mergeConversation(previous, next));
          setGeneration(status);
          setError("");
        }
      } catch (reason) {
        if (current) setError(errorMessage(reason));
      } finally {
        running = false;
      }
    };
    void refresh();
    const timer = setInterval(() => void refresh(), REFRESH_MS);
    return () => {
      current = false;
      active.current = false;
      clearInterval(timer);
    };
  }, [taskId]);
  return { page, setPage, generation, error, setError, active };
}
