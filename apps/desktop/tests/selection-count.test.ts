import { expect, it } from "vitest";
import { selectionCharacterCount } from "../src/review/selection-count";

it("counts Korean, emoji clusters, and CRLF as visible characters rather than UTF-16 code units", () => {
  expect(selectionCharacterCount("한글😀")).toBe(3);
  expect(selectionCharacterCount("가\r\n👨‍👩‍👧‍👦")).toBe(3);
});
