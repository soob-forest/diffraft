import { useEffect, useRef } from "react";
import type { FlushRef } from "./DocumentWorkspace";

export function useConditionFlush(combined: FlushRef) {
  const task = useRef<(() => Promise<void>) | null>(null);
  const rules = useRef<(() => Promise<void>) | null>(null);
  useEffect(() => {
    combined.current = async () => {
      await rules.current?.();
      await task.current?.();
    };
    return () => {
      combined.current = null;
    };
  }, [combined]);
  return { task, rules };
}
