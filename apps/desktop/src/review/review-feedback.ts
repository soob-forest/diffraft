import { useCallback, useState } from "react";

export type ReviewMessageKind = "status" | "attention";
export function useReviewMessage() {
  const [feedback, setFeedback] = useState({
    text: "",
    kind: "status" as ReviewMessageKind,
  });
  const setMessage = useCallback(
    (text: string, kind: ReviewMessageKind = "status") => {
      setFeedback({ text, kind });
    },
    [],
  );
  return { message: feedback.text, messageKind: feedback.kind, setMessage };
}

type FeedbackInput = {
  notice: string;
  noticeImportant?: boolean;
  reviewError: string;
  actionMessage: string;
  actionKind?: ReviewMessageKind;
};
export function unitReviewFeedback(input: FeedbackInput) {
  if (input.notice && input.noticeImportant)
    return { text: input.notice, important: true };
  if (input.reviewError) return { text: input.reviewError, important: true };
  if (input.actionMessage && input.actionKind === "attention")
    return { text: input.actionMessage, important: true };
  return { text: input.notice || input.actionMessage, important: false };
}
