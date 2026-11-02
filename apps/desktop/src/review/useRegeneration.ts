import { invoke } from "@tauri-apps/api/core";
import { useRef, useState } from "react";
import { modelLabel, resolveModel } from "../connection/provider";
import { useSessionDraft } from "../drafts/SessionDrafts";
import type { Proposal } from "../generated/Proposal";
import type { RegenerateRequest } from "../generated/RegenerateRequest";
import type { ReviewProjection } from "../generated/ReviewProjection";
import { errorMessage, SCHEMA_VERSION } from "../ipc";

export type RegenerationProps = {
  proposal: Proposal;
  projection: ReviewProjection;
  blocked: boolean;
  onBusy: (busy: boolean) => void;
  onSaved: () => void;
  prepare: () => Promise<void>;
};

export function useRegeneration(props: RegenerationProps) {
  const state = useRegenerationState(props);
  const { instruction, pending, running, setPending, setBusy, setMessage } =
    state;
  async function submit() {
    if (state.locked || running.current || props.blocked || !instruction.trim())
      return;
    running.current = true;
    setBusy(true);
    props.onBusy(true);
    setMessage("");
    try {
      await state.flush();
      await props.prepare();
      if (!pending) {
        setPending(await prepareRevision(props, instruction));
        return;
      }
      assertCurrentRevision(pending, props);
      setMessage(
        `${modelLabel(pending.model)} · 코멘트와 지시를 반영한 새 후보를 요청하고 있습니다.`,
      );
      const submitted = state.draft.value;
      await invoke("regenerate_proposal", {
        request: { schemaVersion: SCHEMA_VERSION },
        revision: pending,
      });
      state.draft.replace(submitted, { instruction: "", pending: null });
      setMessage("새 후보를 저장했습니다. 비교 후 승인해 주세요.");
    } catch (error) {
      setPending(null);
      setMessage(errorMessage(error));
    } finally {
      running.current = false;
      setBusy(false);
      props.onBusy(false);
      if (pending) props.onSaved();
    }
  }
  return { ...state, submit };
}

function useRegenerationState(props: RegenerationProps) {
  const draft = useSessionDraft<{
    instruction: string;
    pending: RegenerateRequest | null;
  }>(
    JSON.stringify([
      "regenerate",
      props.projection.batch.documentId,
      props.projection.batch.taskId,
      props.projection.batch.id,
      props.proposal.id,
      String(props.proposal.revision),
    ]),
    { instruction: "", pending: null },
  );
  const { instruction, pending } = draft.value;
  const setPending = (pending: RegenerateRequest | null) =>
    draft.set({ ...draft.value, pending });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const running = useRef(false);
  return {
    draft,
    locked: draft.locked,
    instruction,
    pending,
    busy,
    message,
    running,
    flush: draft.flush,
    setPending,
    setBusy,
    setMessage,
    setInstruction: (value: string) => {
      draft.set({ instruction: value, pending: null });
    },
    cancel: () => setPending(null),
  };
}

function assertCurrentRevision(
  pending: RegenerateRequest,
  props: RegenerationProps,
) {
  if (
    pending.expectedHeadId !== props.projection.currentHeadId ||
    pending.expectedRevision !== props.proposal.revision ||
    pending.proposalId !== props.proposal.id
  ) {
    throw new Error(
      "문서 또는 후보가 변경되었습니다. 요청을 다시 확인해 주세요.",
    );
  }
}

async function prepareRevision(
  props: RegenerationProps,
  instruction: string,
): Promise<RegenerateRequest> {
  return {
    model: await resolveModel(),
    documentId: props.projection.batch.documentId,
    batchId: props.projection.batch.id,
    proposalId: props.proposal.id,
    expectedRevision: props.proposal.revision,
    expectedHeadId: props.projection.currentHeadId,
    operationId: crypto.randomUUID(),
    instruction,
    retryOf: null,
  };
}
