import { useState } from "react";
import { SelectedDraftChoices } from "./SelectedDraftChoices";
import { SelectedFields } from "./SelectedFields";
import { SelectionConfirmation } from "./SelectionConfirmation";
import type { Panel } from "./useReviewPanel";
import type { useSelectedGeneration } from "./useSelectedGeneration";

type Props = { panel: Panel; form: ReturnType<typeof useSelectedGeneration> };
export function SelectedComposer({ panel, form }: Props) {
  const [direct, setDirect] = useState(false),
    selection = panel.selectedRequest,
    value = selection.draft.value;
  const candidate = value.target?.kind === "candidate";
  return (
    <>
      <SelectedDraftChoices selection={selection} />
      <SelectedReplacement panel={panel} />
      {candidate && !value.prepared && (
        <button
          type="button"
          disabled={form.busy}
          onClick={() => setDirect((value) => !value)}
        >
          {direct ? "AI 수정 요청으로 돌아가기" : "이 부분 직접 고치기"}
        </button>
      )}
      {value.prepared ? null : candidate && direct ? (
        <DirectSelection panel={panel} form={form} />
      ) : (
        value.target && (
          <SelectedFields
            selection={selection}
            comments={panel.review.state.comments}
            busy={form.busy}
            canPrepare={!selection.choices.length}
            prepare={() => void form.prepare()}
          />
        )
      )}
      {value.prepared && (
        <SelectionConfirmation
          prepared={value.prepared}
          busy={form.busy}
          confirm={() => void form.confirm()}
          cancel={() => selection.draft.set({ ...value, prepared: null })}
        />
      )}
      {form.message && <p role="status">{form.message}</p>}
      {selection.message && <p role="status">{selection.message}</p>}
    </>
  );
}
function SelectedReplacement({ panel }: { panel: Panel }) {
  const selection = panel.selectedRequest;
  if (!selection.replacement) return null;
  return (
    <fieldset>
      <legend>새 수정 대상으로 이동</legend>
      <p>작성 중인 초안은 기존 대상에 보관됩니다.</p>
      <blockquote>{selection.replacement.selection.quote}</blockquote>
      <button
        type="button"
        onClick={() => {
          if (selection.replacement) selection.adopt(selection.replacement);
        }}
      >
        기존 초안 보관하고 새 대상 작성
      </button>
      <button type="button" onClick={selection.cancelReplacement}>
        기존 대상에서 계속 작성
      </button>
    </fieldset>
  );
}
function DirectSelection({ panel, form }: Props) {
  const draft = panel.selectedRequest.draft,
    value = draft.value;
  if (!value.target) return null;
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void form.saveDirect();
      }}
    >
      <label>
        선택 부분의 새 후보 내용
        <textarea
          rows={4}
          disabled={form.busy}
          value={value.replacement ?? value.target.selection.quote}
          onChange={(event) =>
            draft.set({
              ...value,
              replacement: event.target.value,
              prepared: null,
            })
          }
        />
      </label>
      <button type="submit" disabled={form.busy || panel.blocked}>
        선택 부분 후보 저장
      </button>
    </form>
  );
}
