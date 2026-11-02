import type { EditorView } from "@codemirror/view";
import {
  type ReactNode,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { Heading } from "../generated/Heading";
import type { ReviewProjection } from "../generated/ReviewProjection";
import { PaneAlignment } from "./alignment";
import type { LogicalSelection, PaneSide } from "./coordinates";
import type { DiffBookmark, SelectionPosition } from "./DiffPane";
import { groupRowMarks } from "./group-selection";
import {
  compactReviewRows,
  type DiffComparison,
  reviewRows,
  splitRows,
} from "./rows";
import { rememberScroll, synchronizeScroll } from "./scroll";
import { useComparisonWidth } from "./useComparisonWidth";

export type Props = {
  active?: boolean;
  selectedGroup?: string;
  textDetails?: boolean;
  headings?: Heading[];
  labels?: [string, string];
  tools?: { header: ReactNode; selection: ReactNode; compact?: ReactNode };
  projection: DiffComparison;
  onSelection: (value: LogicalSelection | null) => void;
  onSelectionIssue?: (value: string) => void;
  onEditSelection?: () => void;
  selectionTools?: ReactNode;
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
export function useDiffViewer(props: Props) {
  const [popup, setPopup] = useState<{
    comparison: DiffComparison;
    position: SelectionPosition | null;
  } | null>(null);
  useLayoutEffect(() => {
    if (props.active === false || !props.selectionTools) setPopup(null);
  }, [props.active, props.selectionTools]);
  const selectionPosition =
    popup?.comparison === props.projection ? popup.position : null;
  const setSelectionPosition = (position: SelectionPosition | null) => {
    if (!position && document.activeElement?.closest(".selection-context"))
      views.current.get(popup?.position?.side ?? "inline")?.focus();
    setPopup({ comparison: props.projection, position });
  };
  const clearPointerPopup = () =>
    setPopup((current) => (current?.position?.focus ? current : null));
  const bookmark = useRef<DiffBookmark>({
    selection: null,
    scrollKey: "",
  });
  const views = useRef(new Map<PaneSide, EditorView>());
  const display = useDisplay(
    props.projection,
    () => {
      setSelectionPosition(null);
      const view = views.current.get("before") ?? views.current.get("inline");
      if (view) rememberScroll(view, bookmark);
    },
    props.headings,
  );
  const width = useComparisonWidth(display.split);
  const common = useDiffPanes({
    props,
    display,
    bookmark,
    views,
    setSelectionPosition,
    clearPointerPopup,
  });
  return {
    width,
    display,
    common,
    selectionPosition,
    closeSelection: (restoreFocus = true) => {
      const side = selectionPosition?.side;
      setSelectionPosition(null);
      if (side && restoreFocus) views.current.get(side)?.focus();
    },
  };
}

function useDiffPanes({
  props,
  display,
  bookmark,
  views,
  setSelectionPosition,
  clearPointerPopup,
}: {
  props: Props;
  display: ReturnType<typeof useDisplay>;
  bookmark: React.RefObject<DiffBookmark>;
  views: React.RefObject<Map<PaneSide, EditorView>>;
  setSelectionPosition: (value: SelectionPosition | null) => void;
  clearPointerPopup: () => void;
}) {
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
  return {
    selectionActionsEnabled:
      props.active !== false && Boolean(props.selectionTools),
    markers,
    bookmark,
    whitespace: display.whitespace,
    onSelection: props.onSelection,
    onSelectionIssue: props.onSelectionIssue,
    onEditSelection: props.onEditSelection,
    onSelectionPosition: props.selectionTools
      ? setSelectionPosition
      : undefined,
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
      scrollPanes(views, clearPointerPopup, side, top),
  };
}

function scrollPanes(
  views: React.RefObject<Map<PaneSide, EditorView>>,
  close: () => void,
  side: PaneSide,
  top: number,
) {
  close();
  synchronizeScroll(views.current, side, top);
}
