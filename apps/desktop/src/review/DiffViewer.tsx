import type { EditorView } from "@codemirror/view";
import { useMemo, useRef, useState } from "react";
import { PaneAlignment } from "./alignment";
import type { LogicalSelection, PaneSide } from "./coordinates";
import { type DiffBookmark, DiffPane } from "./DiffPane";
import { type DiffComparison, reviewRows, splitRows } from "./rows";
import { rememberScroll, synchronizeScroll } from "./scroll";
import { TextDiff } from "./TextDiff";

type Props = {
  projection: DiffComparison;
  onSelection: (value: LogicalSelection | null) => void;
  onMove: (direction: number) => void;
  jump: { selection: LogicalSelection; serial: number } | null;
};
function useDisplay(projection: DiffComparison, beforeChange: () => void) {
  const [split, setSplit] = useState(false);
  const [full, setFull] = useState(false);
  const [whitespace, setWhitespace] = useState(false);
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const rows = useMemo(
    () => reviewRows(projection, expanded, full),
    [projection, expanded, full],
  );
  const pairs = useMemo(() => splitRows(rows), [rows]);
  const before = useMemo(() => pairs.map((pair) => pair.before), [pairs]);
  const after = useMemo(() => pairs.map((pair) => pair.after), [pairs]);
  return {
    split,
    setSplit: (value: boolean) => {
      beforeChange();
      setSplit(value);
    },
    full,
    setFull: (value: boolean) => {
      beforeChange();
      setFull(value);
    },
    whitespace,
    setWhitespace: (value: boolean) => {
      beforeChange();
      setWhitespace(value);
    },
    rows,
    before,
    after,
    expand: (key: string) => {
      beforeChange();
      setExpanded((values) => new Set([...values, key]));
    },
  };
}
export function DiffViewer(props: Props) {
  const bookmark = useRef<DiffBookmark>({
    selection: null,
    scrollKey: "",
  });
  const views = useRef(new Map<PaneSide, EditorView>());
  const display = useDisplay(props.projection, () => {
    const view = views.current.get("before") ?? views.current.get("inline");
    if (view) rememberScroll(view, bookmark);
  });
  const alignment = useRef(new PaneAlignment());
  const common = {
    bookmark,
    whitespace: display.whitespace,
    onSelection: props.onSelection,
    onExpand: display.expand,
    onMove: props.onMove,
    jump: props.jump,
    register: (side: PaneSide, view: EditorView | null) => {
      alignment.current.register(side, view);
      if (view) views.current.set(side, view);
      else views.current.delete(side);
    },
    onMeasure: () => alignment.current.measure(),
    onScroll: (side: PaneSide, top: number) =>
      synchronizeScroll(views.current, side, top),
  };
  return (
    <section className="diff-viewer" aria-label="변경 비교">
      <DisplayToolbar display={display} />
      <div className={`diff-panes ${display.split ? "split" : "inline"}`}>
        {display.split ? (
          <>
            <DiffPane {...common} side="before" rows={display.before} />
            <DiffPane {...common} side="after" rows={display.after} />
          </>
        ) : (
          <DiffPane {...common} side="inline" rows={display.rows} />
        )}
      </div>
      <FoldControls display={display} />
      <TextDiff hunks={props.projection.hunks} />
    </section>
  );
}
function DisplayToolbar({
  display,
}: {
  display: ReturnType<typeof useDisplay>;
}) {
  return (
    <div className="diff-toolbar">
      <button
        type="button"
        aria-pressed={!display.split}
        onClick={() => display.setSplit(false)}
      >
        인라인
      </button>
      <button
        type="button"
        aria-pressed={display.split}
        onClick={() => display.setSplit(true)}
      >
        나란히
      </button>
      <label>
        <input
          type="checkbox"
          checked={display.full}
          onChange={(event) => display.setFull(event.target.checked)}
        />
        전체 문맥
      </label>
      <label>
        <input
          type="checkbox"
          checked={display.whitespace}
          onChange={(event) => display.setWhitespace(event.target.checked)}
        />
        공백 표시
      </label>
      <span className="muted">− 삭제 · + 추가 · F7 다음 변경</span>
    </div>
  );
}

function FoldControls({ display }: { display: ReturnType<typeof useDisplay> }) {
  return (
    <>
      {display.rows.some((row) => row.folded > 0) && (
        <div className="diff-folds">
          {display.rows
            .filter((row) => row.folded > 0)
            .map((row) => (
              <button
                key={row.key}
                type="button"
                onClick={() => display.expand(row.key)}
              >
                {row.folded}개 문맥 행 펼치기
              </button>
            ))}
        </div>
      )}
    </>
  );
}
