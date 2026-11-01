import { useRef, useState } from "react";
import type { AiPreferences } from "../generated/AiPreferences";
import { errorMessage } from "../ipc";
import { codexSelectionState, selectedCodexModel } from "./codex-choice";
import { aiSettings } from "./provider";
import { useCodexConnection } from "./useCodexConnection";

export type CodexSettingsProps = {
  prefs: AiPreferences;
  saved: (prefs: AiPreferences) => void;
  close: () => void;
  onBusy: (value: boolean) => void;
};

function useSave(props: CodexSettingsProps) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const lock = useRef(false);
  async function save(operation: () => Promise<AiPreferences>) {
    if (lock.current) return;
    lock.current = true;
    setSaving(true);
    props.onBusy(true);
    setError("");
    setMessage("");
    try {
      props.saved(await operation());
      setMessage("설정을 저장했습니다. 새 요청부터 적용합니다.");
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      lock.current = false;
      setSaving(false);
      props.onBusy(false);
    }
  }
  return { saving, error, setError, message, setMessage, save };
}

export function useCodexSettings(props: CodexSettingsProps) {
  const [selected, setSelected] = useState(props.prefs.codexModel?.model ?? "");
  const [path, setPath] = useState(props.prefs.codexPath ?? "");
  const saving = useSave(props);
  const state = useCodexConnection(JSON.stringify(props.prefs), props.onBusy);
  const choice = codexSelectionState(
    props.prefs,
    state.report?.models ?? [],
    selected,
    path,
  );
  async function saveModel() {
    try {
      const model = selectedCodexModel(
        props.prefs.codexModel,
        state.report?.models ?? [],
        selected,
      );
      await saving.save(() => aiSettings({ kind: "model", model }));
    } catch (reason) {
      saving.setError(errorMessage(reason));
    }
  }
  return {
    error: saving.error,
    message: saving.message,
    state,
    selected,
    path,
    ...choice,
    busy: saving.saving || Boolean(state.operation),
    saveModel,
    select: (value: string) => {
      setSelected(value);
      saving.setMessage("");
    },
    selectPath: (value: string) => {
      setPath(value);
      saving.setMessage("");
    },
    savePath: () => saving.save(() => aiSettings({ kind: "codex_path", path })),
  };
}
