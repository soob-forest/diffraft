import { invoke } from "@tauri-apps/api/core";
import type { ConversationResult } from "../generated/ConversationResult";
import type { GenerationOutcome } from "../generated/GenerationOutcome";
import type { ReviewBatch } from "../generated/ReviewBatch";
import type { SavedGenerationRequest } from "../generated/SavedGenerationRequest";
import type { TaskConversation } from "../generated/TaskConversation";
import { SCHEMA_VERSION } from "../ipc";
import { generationActivity } from "./generation-activity";

export function taskConversation(taskId: string, before: number | null = null) {
  return invoke<TaskConversation>("task_conversation", {
    request: { schemaVersion: SCHEMA_VERSION },
    taskId,
    before,
  });
}

export async function sendRequest(
  saved: SavedGenerationRequest,
  onResult?: (result: ConversationResult) => void,
): Promise<"proposal" | "explanation"> {
  const finish = generationActivity.begin(saved.value.documentId);
  try {
    return await executeRequest(saved, onResult);
  } finally {
    finish();
  }
}

async function executeRequest(
  saved: SavedGenerationRequest,
  onResult?: (result: ConversationResult) => void,
): Promise<"proposal" | "explanation"> {
  const request = { schemaVersion: SCHEMA_VERSION };
  if (saved.kind === "generate") {
    const result = await invoke<GenerationOutcome>("generate_document", {
      request,
      input: saved.value,
    });
    if (result.kind === "patch")
      onResult?.({
        batchId: result.value.id,
        proposalId: null,
        revision: null,
        status: result.value.proposals.length ? "PENDING" : "UNCHANGED",
      });
    return result.kind === "patch" ? "proposal" : "explanation";
  }
  const batch =
    saved.kind === "regenerate"
      ? await invoke<ReviewBatch>("regenerate_proposal", {
          request,
          revision: saved.value,
        })
      : saved.kind === "selection"
        ? await invoke<ReviewBatch>("generate_selection", {
            request,
            input: saved.value,
          })
        : await invoke<ReviewBatch>("generate_rewrite", {
            request,
            rewrite: saved.value,
          });
  onResult?.({
    batchId: batch.id,
    proposalId: saved.kind === "regenerate" ? saved.value.proposalId : null,
    revision:
      saved.kind === "regenerate" ? saved.value.expectedRevision + 1 : null,
    status: "PENDING",
  });
  return "proposal";
}
