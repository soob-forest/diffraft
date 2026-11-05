import { expect, it } from "vitest";
import { diffJumpScroll } from "../src/review/diff-jump";

it("preserves nearest scrolling for existing comparison jumps", () => {
  expect(diffJumpScroll({}, 19)).toEqual({ scrollIntoView: true, effects: [] });
});

it("keeps the selected text position and reveals its group heading on unit jumps", () => {
  const result = diffJumpScroll({ revealGroupHeading: true }, 19);
  expect(result.scrollIntoView).toBe(false);
  expect(Array.isArray(result.effects)).toBe(false);
  if (Array.isArray(result.effects))
    throw new Error("Expected a scroll effect");
  expect(result.effects.value).toMatchObject({
    y: "start",
    yMargin: 48,
    range: { anchor: 19, head: 19 },
  });
});
