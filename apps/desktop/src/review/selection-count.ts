const segmenter = new Intl.Segmenter("ko", { granularity: "grapheme" });
export function selectionCharacterCount(quote: string) {
  return Array.from(segmenter.segment(quote)).length;
}
