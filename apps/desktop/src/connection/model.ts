import { invoke } from "@tauri-apps/api/core";
import type { ModelSelection } from "../generated/ModelSelection";
import type { ModelSettingsAction } from "../generated/ModelSettingsAction";
import { SCHEMA_VERSION } from "../ipc";

export const MODEL_LABELS: Record<ModelSelection, string> = {
  cli_default: "CLI 기본값",
  sonnet: "Sonnet",
  opus: "Opus",
  haiku: "Haiku",
};
export function modelSettings(action: ModelSettingsAction) {
  return invoke<ModelSelection>("model_settings_command", {
    request: { schemaVersion: SCHEMA_VERSION, action },
  });
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
