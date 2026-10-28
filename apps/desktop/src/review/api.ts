import { invoke } from "@tauri-apps/api/core";
import type { ReviewAction } from "../generated/ReviewAction";
import type { ReviewReply } from "../generated/ReviewReply";
import { SCHEMA_VERSION } from "../ipc";

type ReplyMap = { [R in ReviewReply as R["kind"]]: R["value"] };
export async function reviewCommand<K extends ReviewReply["kind"]>(
  action: ReviewAction,
  kind: K,
): Promise<ReplyMap[K]> {
  const reply = await invoke<ReviewReply>("review_command", {
    request: { schemaVersion: SCHEMA_VERSION, action },
  });
  if (reply.kind !== kind)
    throw new Error("검토 결과를 읽을 수 없습니다. 다시 확인해 주세요.");
  return reply.value as ReplyMap[K];
}
