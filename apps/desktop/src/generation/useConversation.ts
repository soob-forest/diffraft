import { useEffect, useRef, useState } from "react";
import { generationSnapshot } from "../connection/api";
import type { GenerationSnapshot } from "../generated/GenerationSnapshot";
import type { TaskConversation } from "../generated/TaskConversation";
import { errorMessage } from "../ipc";
import { taskConversation } from "./api";
import { mergeConversation } from "./state";

const REFRESH_MS = 1000;
export function useConversation(taskId: string) {
  const { page, setPage, generation, error, setError, active, cursors } =
    useConversationPolling(taskId);
  const [olderBusy, setOlderBusy] = useState(false);
  const older = async () => {
    if (!page?.earlierBefore || olderBusy) return;
    setOlderBusy(true);
    try {
      const cursor = page.earlierBefore;
      const next = await taskConversation(taskId, cursor);
      cursors.current.add(cursor);
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
  const cursors = useRef(new Set<number>());
  useEffect(() => {
    active.current = true;
    let current = true;
    let running = false;
    const refresh = async () => {
      if (running) return;
      running = true;
      try {
        const [next, status] = await Promise.all([
          refreshPages(taskId, [...cursors.current]),
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
  return { page, setPage, generation, error, setError, active, cursors };
}

async function refreshPages(taskId: string, cursors: number[]) {
  const [latest, ...earlier] = await Promise.all([
    taskConversation(taskId),
    ...cursors.map((cursor) => taskConversation(taskId, cursor)),
  ]);
  const messages = new Map(
    latest.messages.map((message) => [message.id, message]),
  );
  for (const page of earlier)
    for (const message of page.messages) messages.set(message.id, message);
  return {
    ...latest,
    messages: [...messages.values()].sort((a, b) => a.sequence - b.sequence),
  };
}
