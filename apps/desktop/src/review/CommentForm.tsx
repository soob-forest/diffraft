import { useEffect, useRef } from "react";
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
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void form.save();
        }}
      >
        <CommentFields form={form} proposal={props.proposal} />
        <div className="comment-draft-note">
          <span>미저장 초안 · 이 세션에서 보존</span>
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
          코멘트 저장
        </button>
        <CommentStatus form={form} blocked={props.blocked} />
        <CommentNextStep blocked={props.blocked} onNext={props.onNext} />
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
      <p>미등록 초안은 앱을 닫기 전까지 보관됩니다.</p>
    </details>
  );
}

function CommentStatus({ form, blocked }: { form: Form; blocked: boolean }) {
  return (
    <>
      {blocked && (
        <p role="status">
          문서 저장과 진행 중인 요청·검토 상태를 확인한 뒤 코멘트를 저장할 수
          있습니다. 초안은 유지됩니다.
        </p>
      )}
      {form.message && <p role="status">{form.message}</p>}
      <p className="comment-save-help">
        저장만으로 AI 요청이 시작되지 않습니다.
      </p>
    </>
  );
}

function CommentNextStep({
  blocked,
  onNext,
}: {
  blocked: boolean;
  onNext: () => void;
}) {
  return (
    <div className="comment-next-step">
      <h4>저장 후 다음 행동</h4>
      <p>
        이 변경의 저장된 코멘트를 반영해 다시 제안받을 수 있습니다. 새 후보도
        승인 전에는 원문을 바꾸지 않습니다.
      </p>
      <button type="button" disabled={blocked} onClick={onNext}>
        코멘트 반영 재제안 작성
      </button>
    </div>
  );
}
