import { useEffect, useRef } from "react";
import { DraftLocked } from "../drafts/DraftRecovery";
import type { ConversationResult } from "../generated/ConversationResult";
import { SelectedDraftChoices } from "../review/SelectedDraftChoices";
import { SelectedFields } from "../review/SelectedFields";
import { SelectionConfirmation } from "../review/SelectionConfirmation";
import { FirstRequest } from "./FirstRequest";
import type { RequestScope } from "./request-scope";
import { SourceOverlapNotice, useSourceOverlaps } from "./SourceOverlapNotice";
import type { DocumentModel } from "./useDocument";
import type { SourceRequest } from "./useSourceRequest";

type Props = {
  request: SourceRequest;
  model: DocumentModel;
  scope: RequestScope;
  taskId: string;
  onOverlap: (taskId: string, result: ConversationResult) => void;
};
export function SourceRequestPanel(props: Props) {
  const state = useSourceForm(props),
    { request } = props;
  return (
    <section
      ref={state.root}
      className="source-selection-panel selected-request-form"
      aria-label="선택한 원문 수정"
      onKeyDown={(event) => sourceEscape(event, request, state.form.busy)}
    >
      {props.taskId && <h3>선택한 부분 수정</h3>}
      <button
        type="button"
        disabled={request.busy || state.form.busy}
        onClick={request.close}
      >
        원문으로 돌아가기
      </button>
      <SourcePanelContent {...props} state={state} />
    </section>
  );
}
function sourceEscape(
  event: React.KeyboardEvent,
  request: SourceRequest,
  busy: boolean,
) {
  if (
    event.key !== "Escape" ||
    event.nativeEvent.isComposing ||
    busy ||
    request.busy
  )
    return;
  event.preventDefault();
  const draft = request.selection.draft;
  if (draft.value.prepared) {
    draft.set({ ...draft.value, prepared: null });
    requestAnimationFrame(() =>
      document
        .querySelector<HTMLTextAreaElement>(".source-selection-panel textarea")
        ?.focus(),
    );
  } else request.close();
}
function SourcePanelContent({
  request,
  taskId,
  onOverlap,
  state,
  model,
  scope,
}: Props & { state: ReturnType<typeof useSourceForm> }) {
  const { form, stale, overlaps } = state,
    selection = request.selection;
  return (
    <>
      {taskId && <SourceOverlapNotice state={overlaps} open={onOverlap} />}
      {!taskId ? (
        <FirstRequest
          model={model}
          scope={scope}
          source={request.captured ?? undefined}
          conditionFlush={request.firstConditions}
          onTask={request.acceptTask}
        />
      ) : (
        <SourceDraftFields
          request={request}
          form={form}
          stale={stale}
          blocked={overlaps.blocked}
        />
      )}
      {(form.message || request.message || selection.message) && (
        <p role="status">
          {form.message || request.message || selection.message}
        </p>
      )}
    </>
  );
}
function SourceDraftReplacement({ request }: { request: SourceRequest }) {
  const selection = request.selection,
    target = selection.replacement;
  if (!target) return null;
  return (
    <fieldset>
      <legend>수정 대상 변경</legend>
      <p>기존 대상의 지시는 보관됩니다.</p>
      <blockquote>{target.selection.quote}</blockquote>
      <button type="button" onClick={() => selection.adopt(target)}>
        기존 초안 보관하고 새 대상 작성
      </button>
      <button type="button" onClick={selection.cancelReplacement}>
        현재 요청 대상 유지
      </button>
    </fieldset>
  );
}

function useSourceForm({
  request,
  model,
}: {
  request: SourceRequest;
  model: DocumentModel;
}) {
  const root = useRef<HTMLElement>(null),
    selection = request.selection,
    draft = selection.draft;
  const form = request.form;
  const target = draft.value.target;
  const overlaps = useSourceOverlaps(model.state.tasks, target);
  const stale =
    target?.kind === "confirmed" &&
    (target.candidate !== model.content ||
      target.expectedHeadId !== model.autosave.document.versionId);
  useEffect(() => {
    if (stale && draft.value.prepared)
      draft.replace(draft.value, { ...draft.value, prepared: null });
  }, [stale, draft]);
  useEffect(() => {
    requestAnimationFrame(() =>
      root.current?.querySelector("textarea")?.focus(),
    );
  }, []);
  return { root, form, stale, overlaps };
}

function SourceDraftFields({
  request,
  form,
  stale,
  blocked,
}: {
  request: SourceRequest;
  form: SourceRequest["form"];
  stale: boolean;
  blocked: boolean;
}) {
  const selection = request.selection,
    draft = selection.draft;
  const targetCurrent = !stale && !blocked;
  const busy = form.busy || request.busy;
  const canShowConfirmation = Boolean(draft.value.prepared && targetCurrent);
  return (
    <>
      <DraftLocked locked={selection.locked} />
      <SourceDraftReplacement request={request} />
      <SelectedDraftChoices selection={selection} />
      {stale && (
        <p role="alert">
          원문이 변경되었습니다. 지시는 보관되어 있습니다. 원문에서 범위를 다시
          선택해 주세요.
        </p>
      )}
      {!selection.locked && !canShowConfirmation && (
        <SelectedFields
          selection={selection}
          busy={busy}
          canPrepare={targetCurrent && !selection.choices.length}
          prepare={() => void form.prepare()}
        />
      )}
      {draft.value.prepared && canShowConfirmation && (
        <SelectionConfirmation
          prepared={draft.value.prepared}
          busy={busy}
          confirm={() => void form.confirm()}
          cancel={() => draft.set({ ...draft.value, prepared: null })}
        />
      )}
    </>
  );
}
