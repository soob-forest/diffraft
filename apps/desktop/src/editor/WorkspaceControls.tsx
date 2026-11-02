import { useState } from "react";
import type { ConversationResult } from "../generated/ConversationResult";
import type { DocumentMode } from "./DocumentToolbar";

const SINGLE_PANEL_WIDTH = 720;
export function useReviewEntry(
  setMode: (mode: DocumentMode) => void,
  setTasksOpen: (open: boolean) => void,
) {
  const [rewriteRequest, setRewriteRequest] = useState(0);
  const [selectedDraftRequest, setSelectedDraftRequest] = useState(0);
  const [result, setResult] = useState<ConversationResult | null>(null);
  const show = () => {
    setMode("review");
    if (window.innerWidth <= SINGLE_PANEL_WIDTH) setTasksOpen(false);
  };
  return {
    result,
    selectedDraftRequest,
    openSelectedDraft: () => {
      setSelectedDraftRequest((value) => value + 1);
      show();
    },
    clearResult: () => {
      setResult(null);
      setSelectedDraftRequest(0);
      setRewriteRequest(0);
    },
    openResult: (value: ConversationResult) => {
      setResult({ ...value });
      show();
    },
    rewriteRequest,
    show,
    rewrite: () => {
      setRewriteRequest((value) => value + 1);
      show();
    },
  };
}

export function WorkspaceControls({
  goal,
  tasksOpen,
  setTasksOpen,
}: {
  goal: string;
  tasksOpen: boolean;
  setTasksOpen: React.Dispatch<React.SetStateAction<boolean>>;
}) {
  return (
    <div className="workspace-controls">
      <span title={goal}>현재 작업 · {goal}</span>
      <button
        type="button"
        aria-expanded={tasksOpen}
        aria-controls="task-panel"
        onClick={() => setTasksOpen((value) => !value)}
      >
        {tasksOpen ? "작업 패널 접기" : "작업·AI 요청 열기"}
      </button>
    </div>
  );
}
