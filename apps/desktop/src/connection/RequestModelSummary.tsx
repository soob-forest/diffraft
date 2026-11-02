import { useCallback, useEffect, useRef, useState } from "react";
import { errorMessage } from "../ipc";
import { ConnectionSettings } from "./ConnectionSettings";
import { MODEL_LABELS, readModel } from "./model";
import { aiSettings, modelLabel } from "./provider";

export function RequestModelSummary() {
  const [label, setLabel] = useState("AI 설정 확인 중…");
  const active = useRef(true),
    sequence = useRef(0);
  const reload = useCallback(async () => {
    const ticket = ++sequence.current;
    try {
      const prefs = await aiSettings({ kind: "read" });
      const value =
        prefs.provider === "codex"
          ? prefs.codexModel
            ? modelLabel(prefs.codexModel)
            : "Codex · 기본값 (요청 확인 시 확정)"
          : `Claude Code · ${MODEL_LABELS[await readModel()]}`;
      if (active.current && ticket === sequence.current) setLabel(value);
    } catch (reason) {
      if (active.current && ticket === sequence.current)
        setLabel(errorMessage(reason));
    }
  }, []);
  useEffect(() => {
    active.current = true;
    void reload();
    return () => {
      active.current = false;
    };
  }, [reload]);
  return (
    <div className="request-model-summary">
      <span>새 요청의 AI: {label}</span>
      <ConnectionSettings label="AI 변경" onClose={() => void reload()} />
    </div>
  );
}
