import type { EditorView } from "@codemirror/view";
import type { PaneSide } from "./coordinates";
import type { DiffBookmark } from "./DiffPane";

type ScrollOptions = {
  side: PaneSide;
  bookmark: React.RefObject<DiffBookmark>;
  onScroll: (side: PaneSide, top: number) => void;
};

export function synchronizeScroll(
  views: Map<PaneSide, EditorView>,
  side: PaneSide,
  top: number,
) {
  const source = views.get(side);
  if (!source) return;
  const block = source.lineBlockAtHeight(top - source.documentPadding.top);
  const line = source.state.doc.lineAt(block.from).number;
  const delta = top - source.documentPadding.top - block.top;
  for (const [other, view] of views) {
    if (side === other) continue;
    const target = view.lineBlockAt(
      view.state.doc.line(Math.min(line, view.state.doc.lines)).from,
    );
    const destination =
      target.top +
      view.documentPadding.top +
      Math.min(delta, Math.max(0, target.height - 1));
    if (Math.abs(view.scrollDOM.scrollTop - destination) > 1)
      view.scrollDOM.scrollTop = destination;
  }
}

export function bindScroll(view: EditorView, props: ScrollOptions) {
  const scroll = () => {
    rememberScroll(view, props.bookmark);
    props.onScroll(props.side, view.scrollDOM.scrollTop);
  };
  view.scrollDOM.addEventListener("scroll", scroll);
  return () => view.scrollDOM.removeEventListener("scroll", scroll);
}

export function rememberScroll(
  view: EditorView,
  bookmark: React.RefObject<DiffBookmark>,
) {
  const top = view.scrollDOM.getBoundingClientRect().top;
  const line = [
    ...view.contentDOM.querySelectorAll<HTMLElement>(".cm-line"),
  ].find(
    (row) =>
      row.dataset.sourceKey !== "filler" &&
      row.getBoundingClientRect().bottom > top + 1,
  );
  if (line?.dataset.sourceKey)
    bookmark.current.scrollKey = line.dataset.sourceKey;
}
