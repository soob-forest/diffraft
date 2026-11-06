import { expect, it, vi } from "vitest";
import { prepareSelected } from "../src/review/selected-request-operations";

const prepared = { kind: "selection", value: { context: "{}" } };
vi.mock("../src/review/prepare-selected", () => ({
  prepareSelectionRequest: async () => prepared,
}));
it("consumes first-source automatic preparation in the same snapshot that receives confirmation", async () => {
  let value = {
    instruction: "선택 수정",
    target: { kind: "confirmed" },
    prepared: null,
    prepareOnOpen: true,
  } as unknown;
  const draft = {
    get value() {
      return value;
    },
    flush: async () => {},
    replace: (expected: unknown, next: unknown) => {
      if (value === expected) value = next;
    },
  };
  await prepareSelected(
    { selection: { draft }, prepare: async () => {} } as never,
    { current: true },
  );
  expect(value).toMatchObject({ prepared, prepareOnOpen: false });
});
