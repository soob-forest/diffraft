import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { useEffect, useRef } from "react";
import { rawSource, sourceHistory } from "./raw-history";
import { editableSetup } from "./setup";
import { displayOffset, displayText, sourceOffset } from "./source-buffer";

export interface EditorSelection {
  from: number;
  to: number;
  cursor: number;
}
export interface SourceEditorProps {
  initial: string;
  onChange: (raw: string) => void;
  onSelection: (selection: EditorSelection) => void;
  onComposition: (active: boolean) => void;
  jump: { offset: number; serial: number } | null;
}

function createEditor(
  parent: HTMLElement,
  props: React.RefObject<SourceEditorProps>,
): EditorView {
  return new EditorView({
    parent,
    state: EditorState.create({
      doc: displayText(props.current.initial),
      extensions: [
        editableSetup,
        sourceHistory(props.current.initial),
        EditorView.lineWrapping,
        EditorView.contentAttributes.of({
          "aria-label": "원문 편집",
          "data-testid": "source-editor",
          spellcheck: "false",
        }),
        EditorView.domEventHandlers({
          compositionstart: () => {
            props.current.onComposition(true);
            return false;
          },
          compositionend: () => {
            props.current.onComposition(false);
            return false;
          },
        }),
        EditorView.updateListener.of((update) => {
          const raw = update.state.field(rawSource);
          if (update.docChanged) props.current.onChange(raw);
          if (update.selectionSet || update.docChanged) {
            const selection = update.state.selection.main;
            props.current.onSelection({
              from: sourceOffset(raw, selection.from),
              to: sourceOffset(raw, selection.to),
              cursor: sourceOffset(raw, selection.head),
            });
          }
        }),
      ],
    }),
  });
}

export function SourceEditor(props: SourceEditorProps) {
  const parent = useRef<HTMLDivElement>(null);
  const callbacks = useRef(props);
  callbacks.current = props;
  const view = useRef<EditorView | null>(null);
  useEffect(() => {
    if (!parent.current) return;
    view.current = createEditor(parent.current, callbacks);
    return () => {
      view.current?.destroy();
      view.current = null;
    };
  }, []);
  useEffect(() => {
    const editor = view.current;
    if (!editor || !props.jump) return;
    const offset = displayOffset(
      editor.state.field(rawSource),
      props.jump.offset,
    );
    editor.dispatch({ selection: { anchor: offset }, scrollIntoView: true });
    editor.focus();
  }, [props.jump]);
  return <div className="source-editor" ref={parent} />;
}
