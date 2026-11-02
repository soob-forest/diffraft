import { useEffect, useRef } from "react";
import { DraftLocked } from "../drafts/DraftRecovery";
import type { ConversationResult } from "../generated/ConversationResult";
import { currentResult } from "./result-destination";
import { SelectedComposer } from "./SelectedComposer";
import type { Panel } from "./useReviewPanel";
import { useSelectedGeneration } from "./useSelectedGeneration";

function returnToDiff(panel: Panel) {
  panel.selectedRequest.setActive(false);
  requestAnimationFrame(() =>
    document
      .querySelector<HTMLElement>(
        '.review-current [data-testid="diff-after"], .review-current [data-testid="diff-inline"]',
      )
      ?.focus(),
  );
}
export function SelectedRequestForm({
  panel,
  onResult,
}: {
  panel: Panel;
  onResult: (result: ConversationResult) => void;
}) {
  const selection = panel.selectedRequest;
  const form = useComposerForm(panel, onResult);
  const root = useRef<HTMLElement>(null);
  useEffect(() => {
    if (selection.active)
      requestAnimationFrame(() =>
        root.current?.querySelector("textarea")?.focus(),
      );
  }, [selection.active]);
  if (!selection.active)
    return selection.draft.value.target ? (
      <button type="button" onClick={() => selection.setActive(true)}>
        선택 수정 초안 이어쓰기
      </button>
    ) : null;
  return (
    <section
      className="selected-request-form proposal-details"
      ref={root}
      aria-label="선택한 부분 수정"
      onKeyDown={(event) => composerEscape(event, panel, form.busy, root)}
    >
      <h3>선택한 부분 수정</h3>
      <button
        type="button"
        disabled={form.busy}
        onClick={() => returnToDiff(panel)}
      >
        변경 상세로 돌아가기
      </button>
      <DraftLocked locked={selection.locked} />
      {!selection.locked && <SelectedComposer panel={panel} form={form} />}
    </section>
  );
}

function useComposerForm(
  panel: Panel,
  onResult: (result: ConversationResult) => void,
) {
  const selection = panel.selectedRequest;
  const form = useSelectedGeneration({
    selection,
    prepare: panel.prepareGeneration,
    onBusy: panel.setRegenerating,
    onSaved: (result) => {
      panel.history.close();
      if (result.proposalId) panel.openDetail("summary", result.proposalId);
      returnToDiff(panel);
      onResult(currentResult(result));
      panel.actions.setMessage(
        "선택한 부분의 새 미승인 후보를 저장했습니다. 비교 후 승인해 주세요.",
      );
    },
  });
  return form;
}

function composerEscape(
  event: React.KeyboardEvent,
  panel: Panel,
  busy: boolean,
  root: React.RefObject<HTMLElement | null>,
) {
  const selection = panel.selectedRequest;
  if (event.key !== "Escape" || event.nativeEvent.isComposing || busy) return;
  event.preventDefault();
  if (selection.draft.value.prepared) {
    selection.draft.set({ ...selection.draft.value, prepared: null });
    requestAnimationFrame(() =>
      root.current?.querySelector("textarea")?.focus(),
    );
  } else returnToDiff(panel);
}
