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
  source,
  mode,
  open,
}: {
  children: ReactNode;
  tasks: ReactNode;
  source?: ReactNode;
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
        <PanelContents
          mode={mode}
          tab={tab}
          source={source}
          tasks={tasks}
          setDetail={setDetail}
        />
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
  const returnFocus = useRef<HTMLElement | null>(null);
  const setOpen = open.set;
  const showDetail = useCallback(() => {
    const focused = document.activeElement;
    if (
      focused instanceof HTMLElement &&
      focused !== document.body &&
      !focused.closest(".workspace-panel")
    )
      returnFocus.current = focused;
    detailRequested.current = true;
    setTab("detail");
    setOpen(true);
  }, [setOpen]);
  useEffect(() => {
    if (!open.value && wasOpen.current && returnFocus.current)
      requestAnimationFrame(() => focusPanelEntry(returnFocus.current));
    if (open.value && !wasOpen.current && !detailRequested.current)
      setTab("task");
    wasOpen.current = open.value;
    if (open.value) detailRequested.current = false;
  }, [open.value]);
  const close = useCallback(() => {
    setOpen(false);
    requestAnimationFrame(() => focusPanelEntry(returnFocus.current));
  }, [setOpen]);
  useEffect(() => {
    if (mode === "review") setTab("detail");
  }, [mode]);
  return { detail, setDetail, tab, setTab, showDetail, close };
}
function focusPanelEntry(entry: HTMLElement | null) {
  const target =
    entry?.isConnected && entry.getClientRects().length
      ? entry
      : document.querySelector<HTMLButtonElement>(".workspace-controls button");
  target?.focus();
}
function PanelTabs({
  tab,
  setTab,
}: {
  tab: string;
  setTab: (tab: string) => void;
}) {
  return (
    <div
      className="panel-tabs"
      role="tablist"
      aria-label="검토 보조 영역"
      onKeyDown={(event) => movePanelTab(event, tab, setTab)}
    >
      <button
        type="button"
        role="tab"
        id="review-detail-tab"
        tabIndex={tab === "detail" ? 0 : -1}
        aria-selected={tab === "detail"}
        aria-controls="review-detail"
        onClick={() => setTab("detail")}
      >
        변경 상세
      </button>
      <button
        type="button"
        role="tab"
        id="task-content-tab"
        tabIndex={tab === "task" ? 0 : -1}
        aria-selected={tab === "task"}
        aria-controls="task-content"
        onClick={() => setTab("task")}
      >
        작업·대화
      </button>
    </div>
  );
}

function movePanelTab(
  event: React.KeyboardEvent,
  tab: string,
  setTab: (value: string) => void,
) {
  if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
  event.preventDefault();
  const next =
    event.key === "Home"
      ? "detail"
      : event.key === "End"
        ? "task"
        : tab === "detail"
          ? "task"
          : "detail";
  setTab(next);
  requestAnimationFrame(() =>
    document
      .getElementById(
        next === "detail" ? "review-detail-tab" : "task-content-tab",
      )
      ?.focus(),
  );
}

function PanelContents({
  mode,
  tab,
  source,
  tasks,
  setDetail,
}: {
  mode: DocumentMode;
  tab: string;
  source?: ReactNode;
  tasks: ReactNode;
  setDetail: (value: HTMLDivElement | null) => void;
}) {
  return (
    <>
      <div
        id="review-detail"
        className="review-detail"
        role="tabpanel"
        aria-labelledby="review-detail-tab"
        ref={setDetail}
        hidden={mode !== "review" || tab !== "detail"}
      />
      {mode === "source" && source}
      <section
        aria-label="작업과 대화"
        id="task-content"
        role={mode === "review" ? "tabpanel" : undefined}
        aria-labelledby={mode === "review" ? "task-content-tab" : undefined}
        hidden={
          (mode === "review" && tab !== "task") ||
          (mode === "source" && Boolean(source))
        }
      >
        {tasks}
      </section>
    </>
  );
}
