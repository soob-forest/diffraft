import { useEffect, useState } from "react";
import type { GenerationSnapshot } from "../generated/GenerationSnapshot";
import { errorMessage } from "../ipc";
import { cancelGeneration, generationSnapshot } from "./api";

const REFRESH_MS = 500;
export function GenerationStatus() {
  const { snapshot, error, setError } = useGenerationState();
  async function cancel() {
    if (!snapshot?.operationId) return;
    try {
      await cancelGeneration(snapshot.operationId);
    } catch (reason) {
      setError(errorMessage(reason));
    }
  }
  return (
    <div className="generation-status" aria-live="polite">
      {snapshot?.operationId && (
        <>
          <span>
            {snapshot.cancelling ? "CLI 종료 확인 중…" : "AI 요청 처리 중…"}
          </span>
          <button
            type="button"
            data-operation-id={snapshot.operationId}
            disabled={snapshot.cancelling}
            onClick={() => void cancel()}
          >
            생성 중단
          </button>
        </>
      )}
      {(snapshot?.blocked || error) && (
        <span role="alert">{snapshot?.blocked || error}</span>
      )}
    </div>
  );
}

function useGenerationState() {
  const [snapshot, setSnapshot] = useState<GenerationSnapshot | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    async function refresh() {
      try {
        const next = await generationSnapshot();
        if (active) {
          setSnapshot(next);
          setError("");
        }
      } catch (reason) {
        if (active) setError(errorMessage(reason));
      } finally {
        if (active) timer = setTimeout(() => void refresh(), REFRESH_MS);
      }
    }
    void refresh();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, []);
  return { snapshot, error, setError };
}
