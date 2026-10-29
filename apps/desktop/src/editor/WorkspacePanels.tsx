import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import type { DocumentMode } from "./DocumentToolbar";

type Surface = {
  detail: HTMLDivElement | null;
  detailVisible: boolean;
  showDetail: () => void;
  close: () => void;
};
const ReviewSurface = createContext<Surface | null>(null);
export function useReviewSurface() {
  return useContext(ReviewSurface);
}

export function WorkspacePanels({
  children,
  tasks,
  mode,
  open,
}: {
  children: ReactNode;
  tasks: ReactNode;
  mode: DocumentMode;
  open: { value: boolean; set: (value: boolean) => void };
}) {
  const { detail, setDetail, tab, setTab, showDetail, close } = usePanelState(
    mode,
    open,
  );
  return (
    <ReviewSurface
      value={{
        detail,
        showDetail,
        close,
        detailVisible: open.value && mode === "review" && tab === "detail",
      }}
    >
      {children}
      <aside
        id="task-panel"
        className="workspace-panel"
        hidden={!open.value}
        aria-label="작업과 변경 상세"
      >
        {mode === "review" && <PanelTabs tab={tab} setTab={setTab} />}
        <button type="button" className="panel-return" onClick={close}>
          본문으로 돌아가기
        </button>
        <div
          id="review-detail"
          className="review-detail"
          ref={setDetail}
          hidden={mode !== "review" || tab !== "detail"}
        />
        <div id="task-content" hidden={mode === "review" && tab !== "task"}>
          {tasks}
        </div>
      </aside>
    </ReviewSurface>
  );
}

function usePanelState(
  mode: DocumentMode,
  open: { value: boolean; set: (value: boolean) => void },
) {
  const [detail, setDetail] = useState<HTMLDivElement | null>(null);
  const [tab, setTab] = useState("detail");
  const wasOpen = useRef(open.value);
  const detailRequested = useRef(false);
  const setOpen = open.set;
  const showDetail = useCallback(() => {
    detailRequested.current = true;
    setTab("detail");
    setOpen(true);
  }, [setOpen]);
  useEffect(() => {
    if (open.value && !wasOpen.current && !detailRequested.current)
      setTab("task");
    wasOpen.current = open.value;
    if (open.value) detailRequested.current = false;
  }, [open.value]);
  const close = useCallback(() => {
    setOpen(false);
    requestAnimationFrame(() =>
      document
        .querySelector<HTMLButtonElement>(".workspace-controls button")
        ?.focus(),
    );
  }, [setOpen]);
  useEffect(() => {
    if (mode === "review") setTab("detail");
  }, [mode]);
  return { detail, setDetail, tab, setTab, showDetail, close };
}
function PanelTabs({
  tab,
  setTab,
}: {
  tab: string;
  setTab: (tab: string) => void;
}) {
  return (
    <div className="panel-tabs" role="tablist" aria-label="검토 보조 영역">
      <button
        type="button"
        role="tab"
        aria-selected={tab === "detail"}
        aria-controls="review-detail"
        onClick={() => setTab("detail")}
      >
        변경 상세
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={tab === "task"}
        aria-controls="task-content"
        onClick={() => setTab("task")}
      >
        작업·대화
      </button>
    </div>
  );
}
