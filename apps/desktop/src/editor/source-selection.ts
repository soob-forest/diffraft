import type { EditorSelection } from "./SourceEditor";

export type CapturedSourceSelection = {
  selection: EditorSelection;
  quote: string;
  source: string;
};
export function captureSourceSelection(
  source: string,
  selection: EditorSelection,
): CapturedSourceSelection {
  const { from, to } = selection;
  if (
    !Number.isSafeInteger(from) ||
    !Number.isSafeInteger(to) ||
    from < 0 ||
    to <= from ||
    to > source.length ||
    !unicodeBoundary(source, from) ||
    !unicodeBoundary(source, to)
  )
    throw new Error(
      "선택 영역을 확인할 수 없습니다. 원문에서 범위를 다시 선택해 주세요.",
    );
  return { selection: { ...selection }, quote: source.slice(from, to), source };
}
export function validateSourceSelection(
  captured: CapturedSourceSelection,
  source: string,
) {
  if (
    captured.source !== source ||
    source.slice(captured.selection.from, captured.selection.to) !==
      captured.quote
  )
    throw new Error("원문이 변경되었습니다. 선택 영역을 다시 지정해 주세요.");
  captureSourceSelection(source, captured.selection);
  return {
    kind: "selection" as const,
    from: captured.selection.from,
    to: captured.selection.to,
  };
}
function unicodeBoundary(text: string, offset: number) {
  const before = text.charCodeAt(offset - 1),
    after = text.charCodeAt(offset);
  return !(
    before >= 0xd800 &&
    before <= 0xdbff &&
    after >= 0xdc00 &&
    after <= 0xdfff
  );
}
