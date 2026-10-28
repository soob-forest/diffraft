import { useRef, useState } from "react";
import type { AddComment } from "../generated/AddComment";
import type { Proposal } from "../generated/Proposal";
import type { ReviewProjection } from "../generated/ReviewProjection";
import type { ReviewSide } from "../generated/ReviewSide";
import { errorMessage } from "../ipc";
import { reviewCommand } from "./api";
import { commentTarget } from "./comment-target";
import type { LogicalSelection } from "./coordinates";

type Props = {
  projection: ReviewProjection;
  proposal: Proposal;
  selection: LogicalSelection | null;
  onSaved: () => void;
};
function useCommentForm(props: Props) {
  const [side, setSide] = useState<ReviewSide>(
    props.selection?.side ?? "after",
  );
  const [text, setText] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const pending = useRef<AddComment | null>(null);
  const target = commentTarget(
    props.projection,
    props.proposal,
    side,
    props.selection,
  );
  const save = async () => {
    if (busy) return;
    setBusy(true);
    const comment = {
      id: "",
      batchId: props.projection.batch.id,
      proposalId: props.proposal.id,
      expectedRevision: props.proposal.revision,
      side,
      fromUtf16: target.fromUtf16,
      toUtf16: target.toUtf16,
      text,
    };
    if (
      JSON.stringify(pending.current && { ...pending.current, id: "" }) !==
      JSON.stringify(comment)
    )
      pending.current = { ...comment, id: crypto.randomUUID() };
    try {
      if (!pending.current) return;
      await reviewCommand(
        { kind: "add_comment", comment: pending.current },
        "comment",
      );
      pending.current = null;
      setText("");
      setMessage("코멘트를 저장했습니다.");
      props.onSaved();
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setBusy(false);
    }
  };
  return { side, setSide, text, setText, target, message, busy, save };
}
export function CommentForm(props: Props) {
  const form = useCommentForm(props);
  return (
    <details className="comment-form">
      <summary>코멘트 남기기</summary>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void form.save();
        }}
      >
        <label>
          대상 쪽
          <select
            value={form.side}
            disabled={form.busy}
            onChange={(event) => form.setSide(event.target.value as ReviewSide)}
          >
            <option value="before">변경 전</option>
            <option value="after">변경 후</option>
          </select>
        </label>
        <blockquote>
          {form.target.quote || "선택한 쪽에 내용이 없습니다."}
        </blockquote>
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
        <button
          type="submit"
          disabled={form.busy || !form.target.quote || !form.text.trim()}
        >
          코멘트 저장
        </button>
        <p role="status">{form.message}</p>
      </form>
    </details>
  );
}
