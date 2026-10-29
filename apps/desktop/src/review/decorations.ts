import type { Range } from "@codemirror/state";
import {
  Decoration,
  EditorView,
  GutterMarker,
  gutter,
  WidgetType,
} from "@codemirror/view";
import type { DisplayRow, PaneSide } from "./coordinates";
import type { GroupMark } from "./group-selection";

class NumberMarker extends GutterMarker {
  elementClass: string;
  constructor(
    private text: string,
    private heading = false,
    private kind = "equal",
  ) {
    super();
    this.elementClass = `diff-gutter-${kind}`;
  }
  eq(other: NumberMarker) {
    return (
      other.text === this.text &&
      other.heading === this.heading &&
      other.kind === this.kind
    );
  }
  toDOM() {
    const span = document.createElement("span");
    span.textContent = this.text;
    if (this.heading) span.className = "group-number";
    return span;
  }
}
class Ending extends WidgetType {
  constructor(private text: string) {
    super();
  }
  eq(other: Ending) {
    return other.text === this.text;
  }
  toDOM() {
    const span = document.createElement("span");
    span.className = "diff-eol";
    span.textContent = this.text;
    return span;
  }
}
export function numberGutter(
  rows: DisplayRow[],
  side: PaneSide,
  markers?: Map<string, GroupMark>,
) {
  const starts = new Set<string>();
  const seen = new Set<string>();
  for (const display of rows) {
    const mark = display.row && markers?.get(display.row.key);
    if (mark && !seen.has(mark.id)) {
      starts.add(display.row?.key ?? "");
      seen.add(mark.id);
    }
  }
  return gutter({
    class: `diff-numbers ${side}`,
    lineMarker: (view, line) => {
      const row = rows[view.state.doc.lineAt(line.from).number - 1]?.row;
      if (!row || row.folded) return new NumberMarker("");
      const sign =
        row.kind === "delete" ? "−" : row.kind === "insert" ? "+" : " ";
      const number =
        side === "inline"
          ? String(
              row.kind === "delete" ? (row.oldLine ?? "") : (row.newLine ?? ""),
            ).padStart(4)
          : String(
              (side === "before" ? row.oldLine : row.newLine) ?? "",
            ).padStart(4);
      return new NumberMarker(
        `${number} ${sign}`,
        starts.has(row.key),
        row.kind,
      );
    },
  });
}
export function rowDecorations(rows: DisplayRow[], whitespace: boolean) {
  const decorations: Range<Decoration>[] = [];
  for (const display of rows) {
    const { row, from, text } = display;
    const kind = !row ? "filler" : row.kind;
    decorations.push(
      Decoration.line({
        attributes: {
          class: `diff-${kind}`,
          "data-source-key": row?.key ?? "filler",
        },
      }).range(from),
    );
    if (!row || row.folded) continue;
    let offset = 0;
    for (const segment of row.segments) {
      const end = Math.min(offset + segment.text.length, text.length);
      if (segment.changed && end > offset)
        decorations.push(
          Decoration.mark({ class: "diff-expression" }).range(
            from + offset,
            from + end,
          ),
        );
      offset += segment.text.length;
    }
    if (whitespace) {
      decorations.push(
        Decoration.widget({
          widget: new Ending(lineEnding(row.raw)),
          side: 1,
        }).range(from + text.length),
      );
    }
  }
  return EditorView.decorations.of(Decoration.set(decorations, true));
}

function lineEnding(raw: string) {
  if (raw.endsWith("\r\n")) return "CRLF";
  if (raw.endsWith("\r")) return "CR";
  if (raw.endsWith("\n")) return "LF";
  return "줄 끝 없음";
}

export function groupDecorations(
  rows: DisplayRow[],
  markers?: Map<string, GroupMark>,
) {
  const ranges: Range<Decoration>[] = [];
  const started = new Set<string>();
  for (const display of rows) {
    const mark = display.row && markers?.get(display.row.key);
    if (mark) {
      const first = !started.has(mark.id);
      started.add(mark.id);
      ranges.push(
        Decoration.line({
          attributes: {
            class: `${mark.selected ? "selected-change" : "review-change"}${first ? " change-group-start" : ""}`,
            "data-group-title": mark.title,
            "data-group-id": mark.id,
            title: mark.title,
          },
        }).range(display.from),
      );
    }
  }
  return EditorView.decorations.of(Decoration.set(ranges, true));
}
