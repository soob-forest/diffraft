import { invoke } from "@tauri-apps/api/core";
import type { ModelSelection } from "../generated/ModelSelection";
import type { ModelSettingsAction } from "../generated/ModelSettingsAction";
import { requestInputChanged } from "../generation/request-invalidation";
import { SCHEMA_VERSION } from "../ipc";

export const MODEL_LABELS: Record<ModelSelection, string> = {
  cli_default: "CLI 기본값",
  sonnet: "Sonnet",
  opus: "Opus",
  haiku: "Haiku",
};
export async function modelSettings(action: ModelSettingsAction) {
  const saved = await invoke<ModelSelection>("model_settings_command", {
    request: { schemaVersion: SCHEMA_VERSION, action },
  });
  if (action.kind !== "read") requestInputChanged();
  return saved;
}
export function readModel() {
  return modelSettings({ kind: "read" });
}

export function modelTestCurrent(
  tested: ModelSelection | null | undefined,
  saved: ModelSelection | null,
  selected: ModelSelection,
) {
  return saved !== null && tested === saved && selected === saved;
}
