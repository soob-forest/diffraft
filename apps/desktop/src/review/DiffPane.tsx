import { defaultKeymap } from "@codemirror/commands";
import { Compartment, EditorState } from "@codemirror/state";
import {
  drawSelection,
  EditorView,
  highlightWhitespace,
  keymap,
  type ViewUpdate,
} from "@codemirror/view";
import { useEffect, useLayoutEffect, useRef } from "react";
import { selectionGesture } from "../editor/selection-gesture";
import { alignmentExtension } from "./alignment";
import {
  type DisplayRow,
  displayRows,
  displaySelection,
  logicalSelection,
  type PaneSide,
} from "./coordinates";
import { groupDecorations, numberGutter, rowDecorations } from "./decorations";
import { diffJumpScroll } from "./diff-jump";
import type { DiffPaneProps as Props } from "./diff-pane-types";
import { bindScroll } from "./scroll";

export type { DiffBookmark, SelectionPosition } from "./diff-pane-types";

function createPane(
  parent: HTMLElement,
  props: Props,
  current: React.RefObject<Props>,
  markers: Compartment,
) {
  const rows = displayRows(props.rows);
  const state = paneState(rows, props, current, markers);
  const index = props.rows.findIndex(
    (row) => row?.key === props.bookmark.current.scrollKey,
  );
  return new EditorView({
    parent,
    state,
    scrollTo:
      index < 0
        ? undefined
        : EditorView.scrollIntoView(state.doc.line(index + 1).from, {
            y: "start",
            yMargin: 0,
          }),
  });
}
function paneState(
  rows: DisplayRow[],
  props: Props,
  current: React.RefObject<Props>,
  markers: Compartment,
) {
  const restore = props.bookmark.current.selection;
  return EditorState.create({
    doc: rows.map((r) => r.text).join("\n"),
    selection:
      restore && (props.side === "inline" || restore.side === props.side)
        ? (displaySelection(rows, restore) ?? undefined)
        : undefined,
    extensions: [
      EditorState.readOnly.of(true),
      EditorView.editable.of(false),
      EditorView.lineWrapping,
      alignmentExtension(() => current.current.onMeasure()),
      drawSelection(),
      EditorState.transactionFilter.of((transaction) =>
        transaction.docChanged ? [] : transaction,
      ),
      numberGutter(rows, props.side, props.markers),
      rowDecorations(rows, props.whitespace),
      markers.of(groupDecorations(rows, props.markers)),
      ...(props.whitespace ? [highlightWhitespace()] : []),
      EditorView.contentAttributes.of({
        "aria-label":
          props.side === "inline"
            ? "인라인 변경 비교"
            : props.side === "before"
              ? "변경 전 비교"
              : "변경 후 비교",
        "aria-readonly": "true",
        tabindex: "0",
        "data-testid": `diff-${props.side}`,
      }),
      paneEvents(rows, props, current),
    ],
  });
}
function paneEvents(
  rows: DisplayRow[],
  props: Props,
  current: React.RefObject<Props>,
) {
  return [
    keymap.of([
      moveKey("F7", 1, current),
      moveKey("Shift-F7", -1, current),
      {
        key: "Enter",
        run: (view) =>
          expandAt(view.state.selection.main.head, view, current.current),
      },
      ...defaultKeymap,
      {
        key: "Mod-Shift-Enter",
        run: (view) => {
          if (
            !current.current.onEditSelection ||
            view.state.selection.main.empty
          )
            return false;
          current.current.onEditSelection();
          return true;
        },
      },
      {
        key: "Shift-F10",
        run: (view) => showSelectionActions(view, current.current, true),
      },
    ]),
    pointerEvents(current),
    selectionGesture({
      enabled: () => current.current.selectionActionsEnabled !== false,
      show: (view, focus) => {
        showSelectionActions(view, current.current, focus);
      },
      close: () => current.current.onSelectionPosition?.(null),
    }),
    EditorView.updateListener.of((update) => {
      if (!update.selectionSet) return;
      reportSelection(update, rows, props.side, current.current);
    }),
  ];
}
function pointerEvents(current: React.RefObject<Props>) {
  return EditorView.domEventHandlers({
    contextmenu: (event, view) => {
      if (!showSelectionActions(view, current.current, true)) return false;
      event.preventDefault();
      return true;
    },
    click: (event, view) => {
      view.focus();
      const row =
        event.target instanceof Element
          ? event.target.closest<HTMLElement>("[data-group-id]")
          : null;
      if (row?.dataset.groupId)
        current.current.onGroupSelect?.(row.dataset.groupId);
      return false;
    },
    dblclick: (event, view) => {
      const position = view.posAtCoords({ x: event.clientX, y: event.clientY });
      return position !== null && expandAt(position, view, current.current);
    },
  });
}
function reportSelection(
  update: ViewUpdate,
  rows: DisplayRow[],
  side: PaneSide,
  props: Props,
) {
  const selection = update.state.selection.main;
  const value =
    update.state.selection.ranges.length === 1
      ? logicalSelection(rows, selection, side)
      : null;
  props.bookmark.current.selection = value;
  props.onSelection(value);
  props.onSelectionIssue?.(
    !selection.empty && !value
      ? "변경 전·제안 내용·접힌 구간 또는 여러 범위가 섞여 있습니다. 한쪽의 연속 범위를 다시 선택해 주세요."
      : "",
  );
  if (selection.empty) props.onSelectionPosition?.(null);
}
function showSelectionActions(view: EditorView, props: Props, focus: boolean) {
  if (
    props.selectionActionsEnabled === false ||
    !props.onSelectionPosition ||
    view.state.selection.main.empty
  )
    return false;
  const rect = view.coordsAtPos(view.state.selection.main.head);
  if (!rect) return false;
  props.onSelectionPosition({
    left: rect.left,
    top: rect.bottom,
    above: rect.top,
    right: view.scrollDOM.getBoundingClientRect().right,
    side: props.side,
    focus,
  });
  return true;
}
function expandAt(position: number, view: EditorView, props: Props) {
  const row = props.rows[view.state.doc.lineAt(position).number - 1];
  if (!row?.folded) return false;
  props.onExpand(row.key);
  return true;
}
export function DiffPane(props: Props) {
  const { parent, editor, markerConfiguration } = usePaneView(props);
  useLayoutEffect(() => {
    if (props.selectionActionsEnabled === false) editor.current?.dispatch({});
  }, [props.selectionActionsEnabled, editor]);
  const handledJump = useRef(props.jump?.serial);
  useEffect(() => {
    if (
      !editor.current ||
      !props.jump ||
      handledJump.current === props.jump.serial
    )
      return;
    if (props.side !== "inline" && props.jump.selection.side !== props.side)
      return;
    const selection = displaySelection(
      displayRows(props.rows),
      props.jump.selection,
    );
    if (selection) {
      handledJump.current = props.jump.serial;
      editor.current.dispatch({
        selection,
        ...diffJumpScroll(props.jump, selection.head),
      });
      if (props.jump.focus !== false) editor.current.focus();
    }
  }, [props.jump, props.rows, props.side, editor]);
  useEffect(() => {
    editor.current?.dispatch({
      effects: markerConfiguration.current.reconfigure(
        groupDecorations(displayRows(props.rows), props.markers),
      ),
    });
  }, [props.markers, props.rows, editor, markerConfiguration]);
  return <div className="diff-pane" ref={parent} />;
}

function usePaneView(props: Props) {
  const parent = useRef<HTMLDivElement>(null);
  const current = useRef(props);
  current.current = props;
  const editor = useRef<EditorView | null>(null);
  const markerConfiguration = useRef(new Compartment());
  useEffect(() => {
    if (!parent.current) return;
    const options = {
      ...current.current,
      rows: props.rows,
      side: props.side,
      whitespace: props.whitespace,
    };
    const view = createPane(
      parent.current,
      options,
      current,
      markerConfiguration.current,
    );
    editor.current = view;
    current.current.register(props.side, view);
    const unbind = bindScroll(view, current.current);
    const resize = new ResizeObserver(() => {
      current.current.onMeasure();
    });
    resize.observe(parent.current);
    return () => {
      resize.disconnect();
      unbind();
      view.destroy();
      editor.current = null;
      current.current.register(props.side, null);
    };
  }, [props.rows, props.side, props.whitespace]);
  return { parent, editor, markerConfiguration };
}

function moveKey(
  key: string,
  direction: number,
  current: React.RefObject<Props>,
) {
  return {
    key,
    run: () => {
      current.current.onMove(direction);
      return true;
    },
  };
}
