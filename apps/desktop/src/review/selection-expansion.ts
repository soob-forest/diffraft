import type { ReviewProjection } from "../generated/ReviewProjection";
import type { LogicalSelection } from "./coordinates";
import { selectedRequestTarget } from "./selection-targets";

export function expandCandidateSelection(
  projection: ReviewProjection,
  selection: LogicalSelection | null,
  unit: "sentence" | "paragraph",
): LogicalSelection {
  if (selection?.side !== "after")
    throw new Error("제안 쪽의 문장이나 문단을 선택해 주세요.");
  const { target, probeFrom } = cursorTarget(projection, selection);
  const point = selection.from;
  const candidate = target.candidate,
    origin = probeFrom - target.selection.fromUtf16,
    offset = Math.min(point - origin, candidate.length - 1);
  const paragraph = Array.from(
    candidate.matchAll(/[^\r\n]+(?:\r?\n(?!\r?\n)[^\r\n]+)*/g),
  ).find(
    (part) => offset >= part.index && offset <= part.index + part[0].length,
  );
  if (!paragraph)
    throw new Error("문단 경계가 모호합니다. 드래그로 지정해 주세요.");
  if (
    /[`|]|^\s*(?:#|[-*+>]|\d+[.)])\s/m.test(paragraph[0]) ||
    (candidate.slice(0, paragraph.index).match(/^\s*(?:```|~~~)/gm)?.length ??
      0) % 2
  )
    throw new Error(
      "Markdown 경계가 모호합니다. 드래그로 정확한 범위를 지정해 주세요.",
    );
  let from = paragraph.index,
    to = from + paragraph[0].length;
  if (unit === "sentence")
    ({ from, to } = sentenceRange(paragraph[0], from, offset));
  const expanded = {
    side: "after" as const,
    from: origin + from,
    to: origin + to,
  };
  const checked = selectedRequestTarget(projection, expanded);
  if (
    checked.kind !== target.kind ||
    checked.candidate !== target.candidate ||
    checked.selection.quote !== candidate.slice(from, to)
  )
    throw new Error("변경 경계를 포함합니다. 드래그로 범위를 지정해 주세요.");
  return expanded;
}

function cursorTarget(
  projection: ReviewProjection,
  selection: LogicalSelection,
) {
  const point = selection.from;
  let probeFrom = point;
  let target: ReturnType<typeof selectedRequestTarget>;
  try {
    target = selectedRequestTarget(projection, {
      ...selection,
      to: point + 1,
    });
  } catch {
    probeFrom = point - 1;
    target = selectedRequestTarget(projection, {
      ...selection,
      from: probeFrom,
      to: point,
    });
  }
  return { target, probeFrom };
}

function sentenceRange(text: string, from: number, offset: number) {
  const segments = new Intl.Segmenter("ko", {
    granularity: "sentence",
  }).segment(text);
  const sentence = Array.from(segments).find(
    (part) =>
      offset - from >= part.index &&
      offset - from < part.index + part.segment.length,
  );
  if (!sentence)
    throw new Error("문장 경계가 모호합니다. 드래그로 지정해 주세요.");
  from += sentence.index;
  const to = from + sentence.segment.length;
  return { from, to };
}
