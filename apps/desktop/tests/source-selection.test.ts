import { expect, it } from "vitest";
import {
  captureSourceSelection,
  validateSourceSelection,
} from "../src/editor/source-selection";

it("keeps exact Unicode and CRLF text after focus moves", () => {
  const source = "앞\r\n한😀글\r\n뒤";
  const captured = captureSourceSelection(source, {
    from: 3,
    to: 7,
    cursor: 7,
  });
  expect(captured.quote).toBe("한😀글");
  expect(validateSourceSelection(captured, source)).toEqual({
    kind: "selection",
    from: 3,
    to: 7,
  });
});
it("rejects changed source, empty and broken surrogate ranges rather than widening", () => {
  const captured = captureSourceSelection("앞😀뒤", {
    from: 1,
    to: 3,
    cursor: 3,
  });
  expect(() => validateSourceSelection(captured, "새앞😀뒤")).toThrow(/다시/);
  for (const [from, to] of [
    [1, 1],
    [1, 2],
    [-1, 2],
    [0, 99],
  ])
    expect(() =>
      captureSourceSelection("앞😀뒤", { from, to, cursor: to }),
    ).toThrow();
});
