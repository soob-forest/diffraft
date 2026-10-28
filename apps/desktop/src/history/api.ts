import { invoke } from "@tauri-apps/api/core";
import type { HistoryAction } from "../generated/HistoryAction";
import type { HistoryReply } from "../generated/HistoryReply";
import { SCHEMA_VERSION } from "../ipc";

type Replies = { [R in HistoryReply as R["kind"]]: R["value"] };
export async function historyCommand<K extends HistoryReply["kind"]>(
  action: HistoryAction,
  kind: K,
): Promise<Replies[K]> {
  const reply = await invoke<HistoryReply>("history_command", {
    request: { schemaVersion: SCHEMA_VERSION, action },
  });
  if (reply.kind !== kind)
    throw new Error("버전 기록을 읽을 수 없습니다. 다시 확인해 주세요.");
  return reply.value as Replies[K];
}
