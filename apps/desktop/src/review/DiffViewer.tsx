import type { EditorView } from "@codemirror/view";
import { type ReactNode, useMemo, useRef, useState } from "react";
import type { Heading } from "../generated/Heading";
import type { ReviewProjection } from "../generated/ReviewProjection";
import { PaneAlignment } from "./alignment";
import type { LogicalSelection, PaneSide } from "./coordinates";
import { type DiffBookmark, DiffPane } from "./DiffPane";
import { groupRowMarks } from "./group-selection";
import {
  compactReviewRows,
  type DiffComparison,
  reviewRows,
  splitRows,
} from "./rows";
import { rememberScroll, synchronizeScroll } from "./scroll";
import { TextDiff } from "./TextDiff";
import { useComparisonWidth } from "./useComparisonWidth";

type Props = {
  selectedGroup?: string;
  textDetails?: boolean;
  headings?: Heading[];
  labels?: [string, string];
  tools?: { header: ReactNode; selection: ReactNode; compact?: ReactNode };
  projection: DiffComparison;
  onSelection: (value: LogicalSelection | null) => void;
  onGroupSelect?: (id: string) => void;
  onMove: (direction: number) => void;
  jump: { selection: LogicalSelection; serial: number } | null;
};
function useDisplay(
  projection: DiffComparison,
  beforeChange: () => void,
  headings?: Heading[],
) {
  const [split, setSplit] = useState(false);
  const [full, setFull] = useState(false);
  const [whitespace, setWhitespace] = useState(false);
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const rows = useMemo(() => {
    const source = reviewRows(projection, expanded, full);
    return full || expanded.size || !headings
      ? source
      : compactReviewRows(
          source,
          headings.map((heading) => heading.fromUtf16),
        );
  }, [projection, expanded, full, headings]);
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
function useDiffViewer(props: Props) {
  const bookmark = useRef<DiffBookmark>({
    selection: null,
    scrollKey: "",
  });
  const views = useRef(new Map<PaneSide, EditorView>());
  const display = useDisplay(
    props.projection,
    () => {
      const view = views.current.get("before") ?? views.current.get("inline");
      if (view) rememberScroll(view, bookmark);
    },
    props.headings,
  );
  const width = useComparisonWidth(display.split);
  const markers = useMemo(
    () =>
      "groups" in props.projection
        ? groupRowMarks(
            props.projection as ReviewProjection,
            display.rows,
            props.selectedGroup || "",
          )
        : undefined,
    [props.projection, display.rows, props.selectedGroup],
  );
  const alignment = useRef(new PaneAlignment());
  const common = {
    markers,
    bookmark,
    whitespace: display.whitespace,
    onSelection: props.onSelection,
    onGroupSelect: props.onGroupSelect,
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
  return { width, display, common };
}
export function DiffViewer(props: Props) {
  const { width, display, common } = useDiffViewer(props);
  return (
    <section ref={width.ref} className="diff-viewer" aria-label="변경 비교">
      {props.tools?.compact || (
        <div className="review-tools">
          <div className="review-primary-tools">{props.tools?.header}</div>
          {props.tools?.selection}
          <DisplayToolbar display={display} />
        </div>
      )}
      {width.narrow && display.split && (
        <p className="split-guidance">
          두 열의 읽기 공간이 좁습니다.{" "}
          <button type="button" onClick={() => display.setSplit(false)}>
            인라인으로 넓게 보기
          </button>
        </p>
      )}
      {display.split && (
        <div className="diff-column-labels">
          <span>{props.labels?.[0] ?? "변경 전"}</span>
          <span>{props.labels?.[1] ?? "변경 후"}</span>
        </div>
      )}
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
      {props.textDetails !== false && (
        <TextDiff hunks={props.projection.hunks} />
      )}
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
