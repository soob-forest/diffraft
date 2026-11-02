import { draftError } from "../drafts/validation";
import { sendRequest } from "../generation/api";
import { reviewCommand } from "./api";
import { prepareSelectionRequest } from "./prepare-selected";
import type { SelectedGenerationProps } from "./useSelectedGeneration";
import { EMPTY_SELECTED } from "./useSelectedRequest";

type Active = React.RefObject<boolean>;
export async function prepareSelected(
  props: SelectedGenerationProps,
  active: Active,
) {
  const submitted = props.selection.draft.value,
    target = submitted.target;
  if (!target) throw new Error("수정할 부분을 선택해 주세요.");
  const error = draftError(submitted.instruction);
  if (error) throw new Error(error);
  await props.selection.draft.flush();
  await props.prepare();
  if (!active.current) return;
  const prepared = await prepareSelectionRequest(target, submitted);
  if (active.current)
    props.selection.draft.replace(submitted, { ...submitted, prepared });
}
export async function confirmSelected(
  props: SelectedGenerationProps,
  active: Active,
  message: (text: string) => void,
) {
  const submitted = props.selection.draft.value,
    prepared = submitted.prepared;
  if (!prepared) return;
  await props.selection.draft.flush();
  await props.prepare();
  if (!active.current) return;
  try {
    const saved =
      prepared.kind === "regenerate"
        ? { kind: "regenerate" as const, value: prepared.value.request }
        : { kind: "selection" as const, value: prepared.value.request };
    await sendRequest(saved, (result) => {
      props.selection.draft.replace(submitted, EMPTY_SELECTED);
      if (active.current) {
        message(
          "선택한 부분의 새 미승인 후보를 저장했습니다. 비교 후 승인해 주세요.",
        );
        props.onSaved(result);
      }
    });
  } catch (reason) {
    props.selection.draft.replace(submitted, { ...submitted, prepared: null });
    throw reason;
  }
}
export async function saveDirectSelection(
  props: SelectedGenerationProps,
  active: Active,
  message: (text: string) => void,
) {
  const submitted = props.selection.draft.value,
    target = submitted.target;
  if (target?.kind !== "candidate") return;
  await props.selection.draft.flush();
  await props.prepare();
  if (!active.current) return;
  const batch = await reviewCommand(
    {
      kind: "revise_selection",
      selection: target.selection,
      revision: {
        documentId: target.documentId,
        batchId: target.batchId,
        proposalId: target.proposalId,
        expectedRevision: target.expectedRevision,
        expectedHeadId: target.expectedHeadId,
        operationId: crypto.randomUUID(),
        after: submitted.replacement ?? target.selection.quote,
      },
    },
    "batch",
  );
  props.selection.draft.replace(submitted, EMPTY_SELECTED);
  if (active.current) {
    message("선택 부분의 새 후보를 저장했습니다. 확정본은 유지됩니다.");
    props.onSaved({
      batchId: batch.id,
      proposalId: target.proposalId,
      revision: target.expectedRevision + 1,
      status: "PENDING",
    });
  }
}
