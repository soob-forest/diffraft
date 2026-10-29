import { useEffect, useRef, useState } from "react";
import type { ConnectionAction } from "../generated/ConnectionAction";
import type { ConnectionReport } from "../generated/ConnectionReport";
import { errorMessage } from "../ipc";
import { cancelGeneration, connectionCommand } from "./api";
import { connectionNextAction } from "./next-action";

export function useConnection() {
  const [report, setReport] = useState<ConnectionReport | null>(null);
  const [tested, setTested] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const cancellation = useCancellation(setError);
  const { setOperation, setCancelling } = cancellation;
  const lock = useRef(false);
  const active = useMounted();
  async function run(action: ConnectionAction) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    setCancelling(false);
    setOperation("operation_id" in action ? action.operation_id : null);
    try {
      const value = await connectionCommand(action);
      if (active.current && value) {
        setReport(value);
        setTested(action.kind === "test");
      }
    } catch (reason) {
      if (active.current) setError(errorMessage(reason));
    } finally {
      lock.current = false;
      if (active.current) {
        setBusy(false);
        setOperation(null);
      }
    }
  }
  return {
    report,
    tested,
    error,
    busy,
    ...cancellation,
    run,
    next: connectionNextAction(report?.status, tested, error),
  };
}

function useMounted() {
  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  return active;
}

function useCancellation(setError: (value: string) => void) {
  const [operation, setOperation] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  async function cancel() {
    if (!operation || cancelling) return;
    setCancelling(true);
    try {
      const snapshot = await cancelGeneration(operation);
      if (!snapshot.cancelling) setCancelling(false);
    } catch (reason) {
      setError(errorMessage(reason));
      setCancelling(false);
    }
  }
  return { operation, cancelling, setOperation, setCancelling, cancel };
}
