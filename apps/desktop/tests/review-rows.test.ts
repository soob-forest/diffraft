import { describe, expect, it } from "vitest";
import type { ReviewProjection } from "../src/generated/ReviewProjection";
import {
  displayLine,
  reviewRows,
  sourceLines,
  splitRows,
  utf16AtByte,
} from "../src/review/rows";

const before = "\ufeff첫 행\r\n10분\r\n끝";
const after = "\ufeff첫 행\r\n5분\r\n끝";
const byteLength = (text: string) => new TextEncoder().encode(text).length;
const prefix = "\ufeff첫 행\r\n";
const projection = {
  before,
  after,
  hunks: [
    {
      oldRange: {
        from: byteLength(prefix),
        to: byteLength(`${prefix}10분\r\n`),
      },
      newRange: {
        from: byteLength(prefix),
        to: byteLength(`${prefix}5분\r\n`),
      },
      groupIds: ["g"],
      lines: [
        {
          kind: "delete",
          oldLine: 2,
          newLine: null,
          segments: [
            { text: "10", changed: true },
            { text: "분\r\n", changed: false },
          ],
        },
        {
          kind: "insert",
          oldLine: null,
          newLine: 2,
          segments: [
            { text: "5", changed: true },
            { text: "분\r\n", changed: false },
          ],
        },
      ],
    },
  ],
} as ReviewProjection;

describe("review display coordinates", () => {
  it("expands context without changing BOM, CRLF, source line numbers or exact bytes", () => {
    const rows = reviewRows(projection, new Set(), true);
    expect(
      rows
        .filter((row) => row.kind !== "insert")
        .map((row) => row.raw)
        .join(""),
    ).toBe(before);
    expect(
      rows
        .filter((row) => row.kind !== "delete")
        .map((row) => row.raw)
        .join(""),
    ).toBe(after);
    expect(rows[1].beforeFrom).toBe(prefix.length);
    expect(rows[2].afterFrom).toBe(prefix.length);
    expect(rows[1].oldLine).toBe(2);
  });
  it("keeps the same logical selection keys across folded, expanded and split modes", () => {
    const folded = reviewRows(projection, new Set(), false);
    expect(folded[0].folded).toBe(1);
    const expanded = reviewRows(projection, new Set([folded[0].key]), false);
    const split = splitRows(expanded);
    expect(split[1].before?.key).toBe(folded[1].key);
    expect(split[1].after?.key).toBe(folded[2].key);
    expect(displayLine(folded[1].raw)).toBe("10분");
  });
  it("uses logical CR/LF lines and rejects a byte inside an emoji", () => {
    expect(sourceLines("a\rb\nc\r\n").map((line) => line.text)).toEqual([
      "a\r",
      "b\n",
      "c\r\n",
    ]);
    expect(utf16AtByte("한😀끝", 7)).toBe(3);
    expect(utf16AtByte("\ufeff한😀끝", 10)).toBe(4);
    expect(() => utf16AtByte("한😀끝", 4)).toThrow();
  });
});
