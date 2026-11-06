import { useEffect, useRef, useState } from "react";
import { useDraftPersistence } from "../drafts/SessionDrafts";
import { useReviewSurface } from "../editor/WorkspacePanels";
import type { QuestionRequest } from "../generated/QuestionRequest";
import { chooseRequestTarget, requestKey } from "../generation/request-targets";
import { errorMessage } from "../ipc";
import { reviewCommand } from "./api";

type Props = { request: QuestionRequest; blocked: boolean };
export function ChangeQuestionEntry({ request, blocked }: Props) {
  const { busy, error, open } = useQuestionEntry(request, blocked);
  return (
    <>
      <button
        type="button"
        disabled={blocked || busy}
        onClick={() => void open()}
      >
        {busy ? "질문 대상 확인 중…" : "이유 묻기"}
      </button>
      {error && <p role="alert">{error}</p>}
    </>
  );
}
function useQuestionEntry(request: QuestionRequest, blocked: boolean) {
  const drafts = useDraftPersistence(),
    surface = useReviewSurface();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const current = useRef(request);
  current.current = request;
  const mounted = useRef(true),
    lock = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const open = async () => {
    if (lock.current || blocked) return;
    lock.current = true;
    setBusy(true);
    setError("");
    const captured = request;
    const valid = () =>
      mounted.current &&
      JSON.stringify(current.current) === JSON.stringify(captured);
    try {
      await openQuestion(drafts, captured, valid);
      if (valid()) surface?.showRequest();
    } catch (reason) {
      if (valid()) setError(errorMessage(reason));
    } finally {
      lock.current = false;
      if (mounted.current) setBusy(false);
    }
  };
  return { busy, error, open };
}
async function openQuestion(
  drafts: ReturnType<typeof useDraftPersistence>,
  request: QuestionRequest,
  valid: () => boolean,
) {
  await drafts.flush();
  const question = await reviewCommand(
    { kind: "prepare_question", request },
    "prepared_question",
  );
  if (!valid()) return;
  chooseRequestTarget(
    drafts.store,
    requestKey(request.documentId, request.taskId),
    { question, referenceBatchId: undefined },
    "EXPLAIN",
  );
  await drafts.flush();
}
