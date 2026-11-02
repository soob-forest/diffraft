import { expect, it } from "vitest";
import { popoverPlacement } from "../src/editor/SelectionPopover";

it("keeps measured controls inside the editor edge and visible viewport", () => {
  expect(
    popoverPlacement(
      { left: 790, top: 590, right: 600 },
      { width: 280, height: 80 },
      { width: 800, height: 600 },
    ),
  ).toEqual({ left: 312, top: 502 });
  expect(
    popoverPlacement(
      { left: -30, top: -20 },
      { width: 120, height: 60 },
      { width: 800, height: 600 },
    ),
  ).toEqual({ left: 8, top: 8 });
});
it("flips above the selected line when the viewport has no space below", () => {
  expect(
    popoverPlacement(
      { left: 100, top: 280, above: 260 },
      { width: 120, height: 64 },
      { width: 400, height: 300 },
    ),
  ).toEqual({ left: 100, top: 188 });
});
