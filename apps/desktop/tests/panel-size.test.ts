import { expect, it } from "vitest";
import { clampSize, keyboardSize, panelLimits } from "../src/panels/panel-size";

it("reserves editing space at desktop and compact widths", () => {
  expect(panelLimits("documents", 1440)).toEqual({
    minimum: 160,
    maximum: 360,
  });
  expect(panelLimits("request", 800).maximum).toBeCloseTo(440);
  expect(panelLimits("request", 200)).toEqual({ minimum: 280, maximum: 280 });
  expect(panelLimits("documents", 800).maximum).toBe(360);
});
it("supports keyboard minimum, maximum, steps and ignores editing keys", () => {
  const limits = panelLimits("request", 1440);
  expect(keyboardSize("Home", 360, limits)).toBe(280);
  expect(keyboardSize("End", 360, limits)).toBe(600);
  expect(keyboardSize("ArrowLeft", 360, limits)).toBe(344);
  expect(keyboardSize("ArrowRight", 360, limits)).toBe(376);
  expect(keyboardSize("a", 360, limits)).toBe(null);
  expect(clampSize(-100, 160, 360)).toBe(160);
  expect(clampSize(900, 160, 360)).toBe(360);
});
