export interface SourceChange {
  from: number;
  to: number;
  insert: string;
}

export function displayText(raw: string): string {
  return raw.replace(/\r\n?/g, "\n");
}

export function sourceOffset(raw: string, displayed: number): number {
  let view = 0;
  for (let source = 0; source < raw.length; source += 1) {
    if (view === displayed) return source;
    if (raw[source] === "\r" && raw[source + 1] === "\n") source += 1;
    view += 1;
  }
  if (view === displayed) return raw.length;
  throw new Error("선택 범위가 원문을 벗어났습니다.");
}

export function displayOffset(raw: string, source: number): number {
  return displayText(raw.slice(0, source)).length;
}

export function applySourceChanges(
  raw: string,
  changes: SourceChange[],
): string {
  const newline = raw.match(/\r\n|\r|\n/)?.[0] ?? "\n";
  const edits = changes.map((change) => ({
    from: sourceOffset(raw, change.from),
    to: sourceOffset(raw, change.to),
    insert: displayText(change.insert).replaceAll("\n", newline),
  }));
  let result = raw;
  let boundary = raw.length;
  for (const edit of edits.reverse()) {
    if (edit.from > edit.to || edit.to > boundary)
      throw new Error("편집 범위가 겹칩니다.");
    result = result.slice(0, edit.from) + edit.insert + result.slice(edit.to);
    boundary = edit.from;
  }
  return result;
}
