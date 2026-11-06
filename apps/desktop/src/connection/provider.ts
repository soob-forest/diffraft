import { invoke } from "@tauri-apps/api/core";
import type { AiPreferences } from "../generated/AiPreferences";
import type { AiSettingsAction } from "../generated/AiSettingsAction";
import type { ProviderModel } from "../generated/ProviderModel";
import { requestInputChanged } from "../generation/request-invalidation";
import { SCHEMA_VERSION } from "../ipc";
import { MODEL_LABELS } from "./model";

export async function aiSettings(action: AiSettingsAction) {
  const saved = await invoke<AiPreferences>("ai_settings_command", {
    request: { schemaVersion: SCHEMA_VERSION, action },
  });
  if (action.kind !== "read") requestInputChanged();
  return saved;
}
export function resolveModel() {
  return invoke<ProviderModel>("resolve_request_model", {
    request: { schemaVersion: SCHEMA_VERSION },
    operationId: crypto.randomUUID(),
  });
}
export function modelLabel(model: ProviderModel | undefined) {
  if (!model) return "확인 중";
  return model.provider === "claude"
    ? `Claude Code · ${MODEL_LABELS[model.model]}`
    : `Codex · ${model.model} (${model.effort})`;
}
