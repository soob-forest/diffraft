import { invoke } from "@tauri-apps/api/core";
import type { AppError } from "./generated/AppError";
import type { AppSnapshot } from "./generated/AppSnapshot";
import type { SnapshotRequest } from "./generated/SnapshotRequest";

export const SCHEMA_VERSION = 1;

export async function workspaceSnapshot(): Promise<AppSnapshot> {
  const request: SnapshotRequest = { schemaVersion: SCHEMA_VERSION };
  return invoke<AppSnapshot>("get_workspace_snapshot", { request });
}

export function errorMessage(error: unknown): string {
  if (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof error.message === "string"
  ) {
    return (error as AppError).message;
  }
  return "요청을 처리할 수 없습니다. 다시 시도해 주세요.";
}
