import { useEffect, useRef } from "react";
import { modelLabel } from "../connection/provider";
import {
  SelectionContext,
  type SelectionContextData,
  SelectionEffects,
} from "./SelectionContext";
import { selectionCharacterCount } from "./selection-count";
import type { SelectedPrepared } from "./useSelectedRequest";

export function SelectionConfirmation({
  prepared,
  busy,
  confirm,
  cancel,
}: {
  prepared: SelectedPrepared;
  busy: boolean;
  confirm: () => void;
  cancel: () => void;
}) {
  const context = JSON.parse(prepared.value.context) as SelectionContextData;
  const { root, heading, cancelAndReturn } = useConfirmationFocus(cancel);
  const target =
    prepared.kind === "regenerate"
      ? prepared.value.request.options?.target
      : null;
  return (
    <section
      ref={root}
      className="selection-confirmation"
      aria-label="선택 수정 요청 확인"
    >
      <h4 ref={heading} tabIndex={-1}>
        요청 내용 확인
      </h4>
      <ConfirmationScope prepared={prepared} context={context} />
      <strong>실제 수정할 부분</strong>
      <blockquote>
        {context.selection
          ? context.selection.quote
          : target?.kind === "candidate_selection"
            ? target.value.quote
            : "변경 전체"}
      </blockquote>
      <strong>수정 지시</strong>
      <p>{prepared.value.request.instruction}</p>
      <p className="request-model">
        공급자 / 모델: {modelLabel(prepared.value.request.model)}
      </p>
      <SelectionContext context={context} />
      <SelectionEffects context={context} />
      <ConfirmationActions
        busy={busy}
        confirm={confirm}
        cancel={cancelAndReturn}
      />
    </section>
  );
}

function ConfirmationScope({
  prepared,
  context,
}: {
  prepared: SelectedPrepared;
  context: SelectionContextData;
}) {
  const label =
    prepared.kind === "regenerate"
      ? `제안 내용 · r${prepared.value.request.expectedRevision}`
      : context.editableSource === "rewrite_candidate"
        ? "전체 재작성 후보"
        : `원문${context.confirmed?.version ? ` · v${context.confirmed.version}` : ""}`;
  return (
    <p className="selected-scope-badge">
      {label}
      {context.selection &&
        ` · 선택한 ${selectionCharacterCount(context.selection.quote)}자`}
    </p>
  );
}

function ConfirmationActions({
  busy,
  confirm,
  cancel,
}: {
  busy: boolean;
  confirm: () => void;
  cancel: () => void;
}) {
  return (
    <>
      <p>
        수정 허용 범위는 위 인용입니다. 참고 문맥은 선택한 AI에 전달하며 사용
        한도를 소비할 수 있습니다. 새 제안은 별도 승인 전까지 확정본에 반영되지
        않습니다.
      </p>
      <button type="button" disabled={busy} onClick={cancel}>
        지시로 돌아가기
      </button>
      <button
        type="button"
        className="primary"
        disabled={busy}
        onClick={confirm}
      >
        확인 후 요청
      </button>
    </>
  );
}

function useConfirmationFocus(cancel: () => void) {
  const heading = useRef<HTMLHeadingElement>(null);
  const root = useRef<HTMLElement>(null);
  useEffect(() => {
    heading.current?.focus();
  }, []);
  const cancelAndReturn = () => {
    const composer = root.current?.closest(".selected-request-form");
    cancel();
    requestAnimationFrame(() =>
      composer?.querySelector<HTMLTextAreaElement>("textarea")?.focus(),
    );
  };
  return { root, heading, cancelAndReturn };
}
