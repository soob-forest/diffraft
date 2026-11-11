import { expect, it } from "vitest";
import { menuFocusIndex, menuPosition } from "../src/documents/menu-behavior";

it("clamps menus at the bottom and right edges without crossing the top and left", () => {
  expect(
    menuPosition(
      { x: 790, y: 590 },
      { width: 260, height: 150 },
      { width: 800, height: 600 },
    ),
  ).toEqual({ left: 532, top: 442 });
  expect(
    menuPosition(
      { x: -20, y: -10 },
      { width: 260, height: 150 },
      { width: 800, height: 600 },
    ),
  ).toEqual({ left: 8, top: 8 });
});
it("supports arrow wrapping, Home and End while leaving activation to native buttons", () => {
  expect(menuFocusIndex("ArrowUp", 0, 2)).toBe(1);
  expect(menuFocusIndex("ArrowDown", 1, 2)).toBe(0);
  expect(menuFocusIndex("Home", 1, 2)).toBe(0);
  expect(menuFocusIndex("End", 0, 2)).toBe(1);
  expect(menuFocusIndex("Enter", 0, 2)).toBeNull();
});
