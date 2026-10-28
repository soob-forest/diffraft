import { invoke } from "@tauri-apps/api/core";
import type { GenerationOutcome } from "../generated/GenerationOutcome";
import type { SavedGenerationRequest } from "../generated/SavedGenerationRequest";
import type { TaskConversation } from "../generated/TaskConversation";
import { SCHEMA_VERSION } from "../ipc";

export function taskConversation(taskId: string, before: number | null = null) {
  return invoke<TaskConversation>("task_conversation", {
    request: { schemaVersion: SCHEMA_VERSION },
    taskId,
    before,
  });
}

export async function sendRequest(
  saved: SavedGenerationRequest,
): Promise<"proposal" | "explanation"> {
  const request = { schemaVersion: SCHEMA_VERSION };
  if (saved.kind === "generate") {
    const result = await invoke<GenerationOutcome>("generate_document", {
      request,
      input: saved.value,
    });
    return result.kind === "patch" ? "proposal" : "explanation";
  }
  if (saved.kind === "regenerate")
    await invoke("regenerate_proposal", { request, revision: saved.value });
  else await invoke("generate_rewrite", { request, rewrite: saved.value });
  return "proposal";
}
