import { expect, it, vi } from "vitest";
import { movePreviewHeading } from "../src/editor/preview-navigation";

it("uses the exact source position and focuses only the matched heading", () => {
  const heading = { scrollIntoView: vi.fn(), focus: vi.fn() };
  const root = { querySelector: vi.fn(() => heading) };
  expect(movePreviewHeading(root as unknown as HTMLElement, 42)).toBe(true);
  expect(root.querySelector).toHaveBeenCalledWith('[data-heading-offset="42"]');
  expect(heading.scrollIntoView).toHaveBeenCalledOnce();
  expect(heading.focus).toHaveBeenCalledWith({ preventScroll: true });
});
it("does not move to a different heading when the requested position is absent", () => {
  const root = { querySelector: vi.fn(() => null) };
  expect(movePreviewHeading(root as unknown as HTMLElement, 42)).toBe(false);
});
it.each([-1, NaN, Infinity, 1.5])(
  "rejects invalid position %s before querying the DOM",
  (offset) => {
    const root = { querySelector: vi.fn() };
    expect(movePreviewHeading(root as unknown as HTMLElement, offset)).toBe(
      false,
    );
    expect(root.querySelector).not.toHaveBeenCalled();
  },
);
