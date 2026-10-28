import { defaultKeymap } from "@codemirror/commands";
import { EditorState } from "@codemirror/state";
import {
  drawSelection,
  EditorView,
  highlightWhitespace,
  keymap,
} from "@codemirror/view";
import { useEffect, useRef } from "react";
import { alignmentExtension } from "./alignment";
import {
  type DisplayRow,
  displayRows,
  displaySelection,
  type LogicalSelection,
  logicalSelection,
  type PaneSide,
} from "./coordinates";
import { numberGutter, rowDecorations } from "./decorations";
import type { ReviewRow } from "./rows";
import { bindScroll } from "./scroll";

export type DiffBookmark = {
  selection: LogicalSelection | null;
  scrollKey: string;
};
type Props = {
  rows: (ReviewRow | null)[];
  side: PaneSide;
  whitespace: boolean;
  bookmark: React.RefObject<DiffBookmark>;
  onSelection: (value: LogicalSelection | null) => void;
  onExpand: (key: string) => void;
  onMove: (direction: number) => void;
  onScroll: (side: PaneSide, top: number) => void;
  register: (side: PaneSide, view: EditorView | null) => void;
  onMeasure: () => void;
  jump: { selection: LogicalSelection; serial: number } | null;
};
function createPane(
  parent: HTMLElement,
  props: Props,
  current: React.RefObject<Props>,
) {
  const rows = displayRows(props.rows);
  const state = paneState(rows, props, current);
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
      numberGutter(rows, props.side),
      rowDecorations(rows, props.whitespace),
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
      {
        key: "F7",
        run: () => {
          current.current.onMove(1);
          return true;
        },
      },
      {
        key: "Shift-F7",
        run: () => {
          current.current.onMove(-1);
          return true;
        },
      },
      {
        key: "Enter",
        run: (view) =>
          expandAt(view.state.selection.main.head, view, current.current),
      },
      ...defaultKeymap,
    ]),
    EditorView.domEventHandlers({
      dblclick: (event, view) => {
        const position = view.posAtCoords({
          x: event.clientX,
          y: event.clientY,
        });
        return position !== null && expandAt(position, view, current.current);
      },
    }),
    EditorView.updateListener.of((update) => {
      if (!update.selectionSet) return;
      const value = logicalSelection(
        rows,
        update.state.selection.main,
        props.side,
      );
      current.current.bookmark.current.selection = value;
      current.current.onSelection(value);
    }),
  ];
}
function expandAt(position: number, view: EditorView, props: Props) {
  const row = props.rows[view.state.doc.lineAt(position).number - 1];
  if (!row?.folded) return false;
  props.onExpand(row.key);
  return true;
}
export function DiffPane(props: Props) {
  const parent = useRef<HTMLDivElement>(null);
  const current = useRef(props);
  current.current = props;
  const editor = useRef<EditorView | null>(null);
  const handledJump = useRef(props.jump?.serial);
  useEffect(() => {
    if (!parent.current) return;
    const options = {
      ...current.current,
      rows: props.rows,
      side: props.side,
      whitespace: props.whitespace,
    };
    const view = createPane(parent.current, options, current);
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
      editor.current.dispatch({ selection, scrollIntoView: true });
    }
  }, [props.jump, props.rows, props.side]);
  return <div className="diff-pane" ref={parent} />;
}
