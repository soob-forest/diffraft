import type { SavedGenerationRequest } from "../generated/SavedGenerationRequest";
import { generationActivity } from "./generation-activity";
import type { useRequestDraft } from "./useRequestDraft";

export async function submitDraft(
  draft: ReturnType<typeof useRequestDraft>,
  send: (request: SavedGenerationRequest) => Promise<void>,
  flush: () => Promise<void>,
  isCurrent: () => boolean,
) {
  if (draft.locked || !draft.pending) return;
  const pending = draft.pending;
  const submitted = draft.beginSubmitted();
  const finish = generationActivity.begin(pending.request.documentId);
  try {
    await flush();
    if (!isCurrent())
      throw new Error("화면이 바뀌어 요청하지 않았습니다. 초안은 보관됩니다.");
    await send(
      pending.kind === "rewrite"
        ? { kind: "rewrite", value: pending.request }
        : { kind: "generate", value: pending.request },
    );
    draft.clearSubmitted(submitted);
  } catch (reason) {
    draft.clearPending(submitted);
    throw reason;
  } finally {
    finish();
  }
}
