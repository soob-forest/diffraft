import { invoke } from "@tauri-apps/api/core";
import type { BufferCopyRequest } from "../generated/BufferCopyRequest";
import type { ConflictAction } from "../generated/ConflictAction";
import type { ConflictReply } from "../generated/ConflictReply";
import { SCHEMA_VERSION } from "../ipc";

type ReplyMap = { [R in ConflictReply as R["kind"]]: R["value"] };
export async function conflictCommand<K extends ConflictReply["kind"]>(
  action: ConflictAction,
  kind: K,
): Promise<ReplyMap[K]> {
  const reply = await invoke<ConflictReply>("conflict_command", {
    request: { schemaVersion: SCHEMA_VERSION, action },
  });
  if (reply.kind !== kind)
    throw new Error("파일 비교 결과를 다시 확인해 주세요.");
  return reply.value as ReplyMap[K];
}
export function saveBufferCopy(request: BufferCopyRequest) {
  return invoke<string | null>("save_buffer_copy", { request });
}
