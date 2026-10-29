export function quotePreviewOffset(
  quote: string,
  before: string,
  after: string,
) {
  if (before === after || (quote !== before && quote !== after)) return 0;
  const oldLines = before.split("\n"),
    newLines = after.split("\n");
  let shared = 0;
  while (
    shared < oldLines.length &&
    shared < newLines.length &&
    oldLines[shared] === newLines[shared]
  )
    shared++;
  const lines = quote.split("\n");
  const start = Math.max(0, Math.min(shared, lines.length - 1) - 1);
  return lines
    .slice(0, start)
    .reduce((offset, line) => offset + line.length + 1, 0);
}
