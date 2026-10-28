import {
  autocompletion,
  closeBrackets,
  closeBracketsKeymap,
  completionKeymap,
} from "@codemirror/autocomplete";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { markdown, markdownKeymap } from "@codemirror/lang-markdown";
import {
  bracketMatching,
  defaultHighlightStyle,
  foldGutter,
  foldKeymap,
  indentOnInput,
  syntaxHighlighting,
} from "@codemirror/language";
import { lintKeymap } from "@codemirror/lint";
import { highlightSelectionMatches, searchKeymap } from "@codemirror/search";
import { EditorState, Prec } from "@codemirror/state";
import {
  crosshairCursor,
  drawSelection,
  dropCursor,
  highlightActiveLine,
  highlightActiveLineGutter,
  highlightSpecialChars,
  keymap,
  lineNumbers,
  rectangularSelection,
} from "@codemirror/view";
import { nativeBackspaceKeymap } from "./native-backspace";

// Explicit public components keep every single-selection Backspace native.
export const editableSetup = [
  lineNumbers(),
  highlightActiveLineGutter(),
  highlightActiveLine(),
  highlightSpecialChars(),
  highlightSelectionMatches(),
  drawSelection(),
  dropCursor(),
  rectangularSelection(),
  crosshairCursor(),
  EditorState.allowMultipleSelections.of(true),
  history({ minDepth: 40 }),
  foldGutter(),
  indentOnInput(),
  bracketMatching(),
  syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
  closeBrackets(),
  autocompletion(),
  markdown({ addKeymap: false }),
  Prec.high(keymap.of(nativeBackspaceKeymap(markdownKeymap))),
  keymap.of(
    nativeBackspaceKeymap([
      ...closeBracketsKeymap,
      ...defaultKeymap,
      ...searchKeymap,
      ...historyKeymap,
      ...foldKeymap,
      ...completionKeymap,
      ...lintKeymap,
    ]),
  ),
];
