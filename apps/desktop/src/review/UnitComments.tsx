import { useEffect, useRef, useState } from "react";
import { DraftLocked, DraftRecovery } from "../drafts/DraftRecovery";
import { DraftStatus, useDraftPersistence } from "../drafts/SessionDrafts";
import { useReviewSurface } from "../editor/WorkspacePanels";
import type { ReviewBatch } from "../generated/ReviewBatch";
import type { ReviewUnit } from "../generated/ReviewUnit";
import type { UnitComment } from "../generated/UnitComment";
import { errorMessage } from "../ipc";
import { reviewCommand } from "./api";
import { unitLabel } from "./unit-review-model";
import { useUnitComment } from "./useUnitComment";

type Props = {
  batch: ReviewBatch;
  unit: ReviewUnit;
  comments: UnitComment[];
  blocked: boolean;
  focusRequest: number;
  onFocusHandled: () => void;
  onSaved: () => void;
};
export function UnitComments(props: Props) {
  const form = useUnitComment(props.batch, props.unit, props.onSaved);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const surface = useReviewSurface();
  const visible = surface?.detailVisible;
  useEffect(() => {
    if (visible && props.focusRequest) {
      textarea.current?.focus();
      props.onFocusHandled();
    }
  }, [props.focusRequest, visible, props.onFocusHandled]);
  return (
    <section
      className="unit-comments"
      aria-label={`변경 ${props.unit.number} 코멘트`}
    >
      <UnitCommentHeading unit={props.unit} />
      <DraftLocked locked={form.draft.locked} />
      <UnitCommentForm
        form={form}
        textarea={textarea}
        blocked={props.blocked}
        close={() => {
          surface?.close();
          requestAnimationFrame(() =>
            document
              .querySelector<HTMLButtonElement>(".unit-comment-trigger")
              ?.focus(),
          );
        }}
      />
      <h4>등록된 코멘트 · {props.comments.length}</h4>
      {!props.comments.length && (
        <p className="muted">
          아직 코멘트가 없습니다. 의견 없이도 승인하거나 거절할 수 있습니다.
        </p>
      )}
      {props.comments.map((comment) => (
        <UnitCommentEntry
          key={comment.id}
          comment={comment}
          blocked={props.blocked}
          onSaved={props.onSaved}
        />
      ))}
      <UnitDraftRecovery />
    </section>
  );
}

function UnitDraftRecovery() {
  const { persistence } = useDraftPersistence();
  return <DraftRecovery persistence={persistence} />;
}

function UnitCommentEntry({
  comment,
  blocked,
  onSaved,
}: {
  comment: UnitComment;
  blocked: boolean;
  onSaved: () => void;
}) {
  const { busy, error, change } = useCommentStatus(comment, blocked, onSaved);
  return (
    <article className="unit-comment-entry">
      <strong>{comment.status === "RESOLVED" ? "해결됨" : "열림"}</strong>
      <p>{comment.text}</p>
      <button
        type="button"
        disabled={blocked || busy}
        onClick={() => void change()}
      >
        {comment.status === "RESOLVED" ? "다시 열기" : "해결로 표시"}
      </button>
      {error && <p role="alert">{error}</p>}
    </article>
  );
}

function UnitCommentForm({
  form,
  textarea,
  blocked,
  close,
}: {
  form: ReturnType<typeof useUnitComment>;
  textarea: React.RefObject<HTMLTextAreaElement | null>;
  blocked: boolean;
  close: () => void;
}) {
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (!blocked) submitComment(form, textarea);
      }}
    >
      <UnitCommentInput form={form} textarea={textarea} close={close} />
      <button
        type="submit"
        disabled={
          blocked ||
          form.busy ||
          form.draft.locked ||
          !form.draft.value.text.trim()
        }
      >
        {form.busy
          ? "코멘트 등록 중…"
          : form.feedback.retryRegistration
            ? "코멘트 다시 등록"
            : "코멘트 등록"}
      </button>
      <DraftStatus
        summary={{
          message: form.feedback.message,
          busy: form.busy,
          retry: form.feedback.retryDraft
            ? () => void form.retryDraft()
            : undefined,
        }}
      />
    </form>
  );
}

function submitComment(
  form: ReturnType<typeof useUnitComment>,
  textarea: React.RefObject<HTMLTextAreaElement | null>,
) {
  void form.save().then((result) => {
    if (result?.kind !== "registered") return;
    requestAnimationFrame(() => {
      if (textarea.current?.offsetParent) textarea.current.focus();
    });
  });
}

function useCommentStatus(
  comment: UnitComment,
  blocked: boolean,
  onSaved: () => void,
) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const lock = useRef(false);
  const change = async () => {
    if (lock.current || blocked) return;
    lock.current = true;
    setBusy(true);
    try {
      await reviewCommand(
        {
          kind: "set_unit_comment_status",
          id: comment.id,
          expectedRevision: comment.revision,
          resolved: comment.status !== "RESOLVED",
        },
        "unit_comment",
      );
      setError("");
      onSaved();
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  return { busy, error, change };
}

function UnitCommentHeading({ unit }: { unit: ReviewUnit }) {
  return (
    <>
      {" "}
      <h3 title={`변경 ${unit.number} · ${unit.title}`}>
        변경 {unit.number} · {unit.title}
      </h3>
      <p>{unitLabel(unit.kind)} · 이 변경 전체에 대한 의견입니다.</p>
    </>
  );
}

function UnitCommentInput({
  form,
  textarea,
  close,
}: {
  form: ReturnType<typeof useUnitComment>;
  textarea: React.RefObject<HTMLTextAreaElement | null>;
  close: () => void;
}) {
  return (
    <label>
      이 변경에 대한 의견
      <textarea
        ref={textarea}
        rows={4}
        required
        value={form.draft.value.text}
        disabled={form.busy || form.draft.locked}
        onChange={(event) => form.setText(event.target.value)}
        onKeyDown={(event) => {
          if (
            event.key === "Escape" &&
            !event.nativeEvent.isComposing &&
            !form.busy
          ) {
            event.preventDefault();
            close();
          }
        }}
      />
    </label>
  );
}
