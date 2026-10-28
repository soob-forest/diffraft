import { invoke } from "@tauri-apps/api/core";
import type { DocumentSnapshot } from "../generated/DocumentSnapshot";
import type { EditorAction } from "../generated/EditorAction";
import type { EditorReply } from "../generated/EditorReply";
import { SCHEMA_VERSION } from "../ipc";

type ReplyMap = { [R in EditorReply as R["kind"]]: R["value"] };
export async function editorCommand<K extends EditorReply["kind"]>(
  action: EditorAction,
  kind: K,
): Promise<ReplyMap[K]> {
  const result = await invoke<EditorReply>("editor_command", {
    request: { schemaVersion: SCHEMA_VERSION, action },
  });
  if (result.kind !== kind)
    throw new Error("예상하지 못한 응답입니다. 앱을 다시 실행해 주세요.");
  return result.value as ReplyMap[K];
}

export function pickDocument(
  create: boolean,
): Promise<DocumentSnapshot | null> {
  return invoke(create ? "new_document" : "pick_document", {
    request: { schemaVersion: SCHEMA_VERSION },
  });
}

export function openPreviewLink(href: string): Promise<void> {
  return invoke("open_preview_link", {
    request: { schemaVersion: SCHEMA_VERSION },
    href,
  });
}
