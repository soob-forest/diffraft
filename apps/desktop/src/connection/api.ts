import { invoke } from "@tauri-apps/api/core";
import type { ConnectionAction } from "../generated/ConnectionAction";
import type { ConnectionReport } from "../generated/ConnectionReport";
import type { GenerationSnapshot } from "../generated/GenerationSnapshot";
import { SCHEMA_VERSION } from "../ipc";

export function connectionCommand(action: ConnectionAction) {
  return invoke<ConnectionReport | null>("connection_command", {
    request: { schemaVersion: SCHEMA_VERSION, action },
  });
}
export function generationSnapshot() {
  return invoke<GenerationSnapshot>("generation_snapshot", {
    request: { schemaVersion: SCHEMA_VERSION },
  });
}
export function cancelGeneration(operationId: string) {
  return invoke<GenerationSnapshot>("cancel_generation", {
    request: { schemaVersion: SCHEMA_VERSION },
    operationId,
  });
}
export function completeShutdown() {
  return invoke<void>("complete_shutdown", {
    request: { schemaVersion: SCHEMA_VERSION },
  });
}
