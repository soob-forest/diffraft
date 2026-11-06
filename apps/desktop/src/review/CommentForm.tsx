import { useEffect, useRef } from "react";
import { DraftLocked } from "../drafts/DraftRecovery";
import { DraftStatus } from "../drafts/SessionDrafts";
import { useReviewSurface } from "../editor/WorkspacePanels";
import { QuotePreview } from "./QuotePreview";
import { quotePreviewOffset } from "./quote-context";
import { type CommentFormProps, useCommentForm } from "./useCommentForm";

type Props = CommentFormProps & {
  active: boolean;
  onBack: () => void;
  onNext: () => void;
};
type Form = ReturnType<typeof useCommentForm>;
export function CommentForm(props: Props) {
  const form = useCommentForm(props);
  const root = useCommentFocus(props.active, form.busy);
  return (
    <section ref={root} className="comment-form" hidden={!props.active}>
      <div className="comment-heading">
        <h3>선택한 변경에 코멘트</h3>
        <button type="button" className="workflow-back" onClick={props.onBack}>
          변경 상세
        </button>
      </div>
      <DraftLocked locked={form.locked} />
      <form
        inert={form.locked}
        onSubmit={(event) => {
          event.preventDefault();
          void form.save();
        }}
      >
        <CommentFields form={form} proposal={props.proposal} />
        <div className="comment-draft-note">
          <DraftStatus />
          <CommentTools form={form} />
        </div>
        <button
          type="submit"
          disabled={
            props.blocked ||
            form.busy ||
            form.stale ||
            !form.target.quote ||
            !form.text.trim()
          }
        >
          코멘트 등록
        </button>
        <CommentStatus form={form} blocked={props.blocked} />
        <CommentNextStep
          blocked={props.blocked}
          busy={form.busy}
          text={form.text}
          onNext={props.onNext}
        />
      </form>
    </section>
  );
}

function useCommentFocus(active: boolean, busy: boolean) {
  const root = useRef<HTMLElement>(null);
  const visible = useReviewSurface()?.detailVisible;
  useEffect(() => {
    if (!active || busy || !visible) return;
    const frame = requestAnimationFrame(() => {
      const panel = root.current?.closest(".workspace-panel");
      if (panel) panel.scrollTop = 0;
      if (!root.current?.hidden)
        root.current?.querySelector("textarea")?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [active, busy, visible]);
  return root;
}

function CommentFields({
  form,
  proposal,
}: {
  form: Form;
  proposal: Props["proposal"];
}) {
  return (
    <>
      <CommentSide form={form} />
      <QuotePreview
        text={form.target.quote || "선택한 쪽에 내용이 없습니다."}
        label="코멘트 대상 인용"
        focusOffset={quotePreviewOffset(
          form.target.quote,
          proposal.operation.before,
          proposal.operation.after,
        )}
      />
      {form.stale && (
        <div className="comment-stale" role="alert">
          <p>
            제안이 바뀌었습니다. 작성한 내용과 인용을 확인한 뒤 대상을 다시
            지정해 주세요.
          </p>
          <button type="button" disabled={form.busy} onClick={form.reconfirm}>
            현재 선택으로 대상 재확인
          </button>
        </div>
      )}
      <label>
        코멘트
        <textarea
          required
          rows={3}
          value={form.text}
          disabled={form.busy}
          onChange={(event) => form.setText(event.target.value)}
        />
      </label>
    </>
  );
}

function CommentSide({ form }: { form: Form }) {
  return (
    <fieldset className="comment-side" aria-label="대상 쪽">
      <button
        type="button"
        aria-pressed={form.side === "before"}
        disabled={form.busy}
        onClick={() => form.setSide("before")}
      >
        변경 전
      </button>
      <button
        type="button"
        aria-pressed={form.side === "after"}
        disabled={form.busy}
        onClick={() => form.setSide("after")}
      >
        제안 내용
      </button>
    </fieldset>
  );
}

function CommentTools({ form }: { form: Form }) {
  return (
    <details className="comment-tools">
      <summary>초안 관리</summary>
      <button
        type="button"
        disabled={form.busy || !form.text}
        onClick={form.clear}
      >
        코멘트 초안 비우기
      </button>
      {!form.stale && (
        <button type="button" disabled={form.busy} onClick={form.reconfirm}>
          현재 선택으로 대상 재확인
        </button>
      )}
      <p>
        미등록 초안은 이 Mac에 보관됩니다. 코멘트 등록과 초안 보관은 별개입니다.
      </p>
    </details>
  );
}

function CommentStatus({ form, blocked }: { form: Form; blocked: boolean }) {
  return (
    <>
      {blocked && (
        <p role="status">
          문서 저장과 진행 중인 요청·검토 상태를 확인한 뒤 코멘트를 등록할 수
          있습니다. 초안은 유지됩니다.
        </p>
      )}
      {form.message && <p role="status">{form.message}</p>}
      <p className="comment-save-help">
        등록만으로 AI 요청이 시작되지 않습니다.
      </p>
    </>
  );
}

export function CommentNextStep({
  blocked,
  busy,
  text,
  onNext,
}: {
  blocked: boolean;
  busy: boolean;
  text: string;
  onNext: () => void;
}) {
  const disabled = blocked || busy || Boolean(text);
  return (
    <div className="comment-next-step">
      <h4>등록 후 다음 행동</h4>
      <p>
        이 변경의 등록된 코멘트를 반영해 다시 제안받을 수 있습니다. 새 후보도
        승인 전에는 원문을 바꾸지 않습니다.
      </p>
      <button
        type="button"
        disabled={disabled}
        onClick={() => {
          if (!disabled) onNext();
        }}
      >
        코멘트 반영 재제안 작성
      </button>
      {disabled && (
        <p role="status">
          미등록 코멘트와 진행 중인 저장·요청을 확인해 주세요. 코멘트 등록 완료
          후 이동할 수 있습니다.
        </p>
      )}
    </div>
  );
}
