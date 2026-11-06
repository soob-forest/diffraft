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
import type { DiffComparison } from "./rows";
import { rememberScroll, synchronizeScroll } from "./scroll";
import { useComparisonWidth } from "./useComparisonWidth";
import { type DiffPreferences, useDiffDisplay } from "./useDiffDisplay";

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
  onDismissSelection?: () => void;
  selectionTools?: ReactNode;
  onGroupSelect?: (id: string) => void;
  onMove: (direction: number) => void;
  jump: {
    selection: LogicalSelection;
    serial: number;
    focus?: boolean;
    revealGroupHeading?: boolean;
  } | null;
  preferences?: DiffPreferences;
  scrollKey?: string;
  onRememberScroll?: (key: string) => void;
};
export function useDiffViewer(props: Props) {
  const views = useRef(new Map<PaneSide, EditorView>());
  const { selectionPosition, setSelectionPosition, clearPointerPopup } =
    useSelectionPopup(props, views);
  const bookmark = useRef<DiffBookmark>({
    selection: null,
    scrollKey: props.scrollKey ?? "",
  });
  const display = useDiffDisplay(
    props.projection,
    () => {
      setSelectionPosition(null);
      const view = views.current.get("before") ?? views.current.get("inline");
      if (view) rememberScroll(view, bookmark);
    },
    props.headings,
    props.preferences,
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
    closeSelection: restoreSelectionFocus(
      selectionPosition,
      setSelectionPosition,
      views,
    ),
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
  display: ReturnType<typeof useDiffDisplay>;
  bookmark: React.RefObject<DiffBookmark>;
  views: React.RefObject<Map<PaneSide, EditorView>>;
  setSelectionPosition: (value: SelectionPosition | null) => void;
  clearPointerPopup: () => void;
}) {
  const markers = useGroupMarkers(props, display.rows);
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
    onDismissSelection:
      props.active !== false ? props.onDismissSelection : undefined,
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
    onScroll: (side: PaneSide, top: number) => {
      scrollPanes(views, clearPointerPopup, side, top);
      props.onRememberScroll?.(bookmark.current.scrollKey);
    },
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

function useGroupMarkers(
  props: Props,
  rows: ReturnType<typeof useDiffDisplay>["rows"],
) {
  return useMemo(
    () =>
      "groups" in props.projection
        ? groupRowMarks(
            props.projection as ReviewProjection,
            rows,
            props.selectedGroup || "",
          )
        : undefined,
    [props.projection, rows, props.selectedGroup],
  );
}

function restoreSelectionFocus(
  selectionPosition: SelectionPosition | null,
  setSelectionPosition: (position: SelectionPosition | null) => void,
  views: React.RefObject<Map<PaneSide, EditorView>>,
) {
  return (restoreFocus = true) => {
    const side = selectionPosition?.side;
    setSelectionPosition(null);
    if (side && restoreFocus) views.current.get(side)?.focus();
  };
}

function useSelectionPopup(
  props: Props,
  views: React.RefObject<Map<PaneSide, EditorView>>,
) {
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
  return { selectionPosition, setSelectionPosition, clearPointerPopup };
}
