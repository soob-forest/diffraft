import { invoke } from "@tauri-apps/api/core";
import { useEffect, useRef, useState } from "react";
import type { CodexAction } from "../generated/CodexAction";
import type { CodexReport } from "../generated/CodexReport";
import { errorMessage, SCHEMA_VERSION } from "../ipc";
import { cancelGeneration } from "./api";

export function useCodexConnection(
  signature: string,
  onBusy: (value: boolean) => void,
) {
  const state = useConnectionState(signature);
  const { report, tested, error, operation, cancelling } = state;
  const run = (action: CodexAction) =>
    runConnection(state, signature, onBusy, action);
  async function cancel() {
    if (!state.operation || state.cancelling) return;
    state.setCancelling(true);
    try {
      await cancelGeneration(state.operation);
    } catch (reason) {
      state.setError(errorMessage(reason));
      state.setCancelling(false);
    }
  }
  return {
    report,
    tested,
    error,
    operation,
    cancelling,
    run,
    cancel,
    needsLogin: state.needsLogin,
  };
}

function useConnectionState(signature: string) {
  const [report, setReport] = useState<CodexReport | null>(null);
  const [tested, setTested] = useState(false);
  const [error, setError] = useState("");
  const [needsLogin, setNeedsLogin] = useState(false);
  const [operation, setOperation] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const active = useRef(true);
  const current = useRef(signature);
  current.current = signature;
  const lock = useRef(false);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  // biome-ignore lint/correctness/useExhaustiveDependencies: saved settings invalidate the earlier report.
  useEffect(() => {
    setTested(false);
    setReport(null);
  }, [signature]);
  useEffect(() => {
    const invalidate = () => setTested(false);
    window.addEventListener("focus", invalidate);
    return () => window.removeEventListener("focus", invalidate);
  }, []);
  return {
    report,
    tested,
    error,
    operation,
    cancelling,
    active,
    current,
    lock,
    setError,
    setTested,
    setCancelling,
    setOperation,
    setReport,
    needsLogin,
    setNeedsLogin,
  };
}

async function runConnection(
  state: ReturnType<typeof useConnectionState>,
  signature: string,
  onBusy: (value: boolean) => void,
  action: CodexAction,
) {
  const { active, current, lock } = state;
  if (lock.current) return;
  lock.current = true;
  onBusy(true);
  state.setError("");
  state.setNeedsLogin(false);
  state.setTested(false);
  state.setCancelling(false);
  const id = crypto.randomUUID();
  const selected = signature;
  state.setOperation(id);
  try {
    const value = await invoke<CodexReport>("codex_connection", {
      request: { schemaVersion: SCHEMA_VERSION, operationId: id, action },
    });
    if (active.current && current.current === selected) {
      state.setReport(value);
      state.setTested(action === "test");
    }
  } catch (reason) {
    if (active.current) {
      state.setError(errorMessage(reason));
      state.setNeedsLogin(
        typeof reason === "object" &&
          reason !== null &&
          "code" in reason &&
          reason.code === "AUTH_REQUIRED",
      );
    }
  } finally {
    lock.current = false;
    onBusy(false);
    if (active.current) {
      state.setOperation(null);
      state.setCancelling(false);
    }
  }
}
