import { expect, it, vi } from "vitest";
import { OperationGate } from "../src/editor/operation-gate";

it("blocks navigation and duplicate mutations until a pending approval finishes", async () => {
  const notify = vi.fn();
  const gate = new OperationGate(notify);
  let finish: () => void = () => {};
  const pending = new Promise<void>((resolve) => {
    finish = resolve;
  });
  const running = gate.run(() => pending);
  expect(() => gate.assertIdle()).toThrow(/처리/);
  await expect(gate.run(async () => {})).rejects.toThrow(/처리/);
  finish();
  await running;
  expect(() => gate.assertIdle()).not.toThrow();
  expect(notify.mock.calls).toEqual([[true], [false]]);
});
it("releases the gate after a failed operation without swallowing its error", async () => {
  const gate = new OperationGate(() => {});
  await expect(
    gate.run(async () => {
      throw new Error("실패");
    }),
  ).rejects.toThrow("실패");
  expect(() => gate.assertIdle()).not.toThrow();
});
