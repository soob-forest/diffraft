import { useState } from "react";
import type { ReviewComment } from "../generated/ReviewComment";
import { errorMessage } from "../ipc";
import { reviewCommand } from "./api";

export function CommentList({
  comments,
  onSaved,
}: {
  comments: ReviewComment[];
  onSaved: () => void;
}) {
  return (
    <section className="comment-list" aria-label="코멘트">
      <h3>코멘트 · {comments.length}</h3>
      {comments.map((comment) => (
        <Comment key={comment.id} comment={comment} onSaved={onSaved} />
      ))}
    </section>
  );
}
function Comment({
  comment,
  onSaved,
}: {
  comment: ReviewComment;
  onSaved: () => void;
}) {
  const { busy, error, change } = useComment(comment, onSaved);
  return (
    <article className="review-comment">
      <strong>
        {comment.status === "RESOLVED"
          ? "해결됨"
          : comment.status === "NEEDS_VERIFICATION"
            ? "연결 위치 확인 필요"
            : "열림"}
      </strong>
      <small>
        {comment.anchor.side === "before" ? "변경 전" : "변경 후"} · 원래 후보 r
        {comment.anchor.proposalRevision}
      </small>
      <blockquote>{comment.anchor.quote}</blockquote>
      <p>{comment.text}</p>
      <button
        type="button"
        disabled={busy}
        onClick={() => {
          void change();
        }}
      >
        {comment.status === "RESOLVED" ? "다시 열기" : "해결로 표시"}
      </button>
      {error && <p role="alert">{error}</p>}
    </article>
  );
}

function useComment(comment: ReviewComment, onSaved: () => void) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const change = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await reviewCommand(
        {
          kind: "set_comment_status",
          id: comment.id,
          expectedRevision: comment.revision,
          resolved: comment.status !== "RESOLVED",
        },
        "comment",
      );
      setError("");
      onSaved();
    } catch (reason) {
      setError(errorMessage(reason));
      onSaved();
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, change };
}
