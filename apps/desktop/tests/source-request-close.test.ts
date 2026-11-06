import { expect, it, vi } from "vitest";
import { closeSourceRequest } from "../src/editor/source-request-close";

it("flushes first-request conditions before closing the source composer", async () => {
  const order: string[] = [];
  await closeSourceRequest(
    (action) => action(),
    {
      current: async () => {
        order.push("saved");
      },
    },
    () => {
      order.push("closed");
    },
  );
  expect(order).toEqual(["saved", "closed"]);
});
it("keeps the source composer open when document conditions cannot save", async () => {
  const close = vi.fn();
  await expect(
    closeSourceRequest(
      (action) => action(),
      {
        current: async () => {
          throw new Error("fixture save failed");
        },
      },
      close,
    ),
  ).rejects.toThrow("fixture save failed");
  expect(close).not.toHaveBeenCalled();
});
