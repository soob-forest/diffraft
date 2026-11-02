import { beforeEach, expect, it, vi } from "vitest";
import { useSourceGeneration } from "../src/editor/useSourceGeneration";
import type { SelectedGenerationProps } from "../src/review/useSelectedGeneration";

const context = vi.hoisted(() => ({
  refs: [] as { current: unknown }[],
  cursor: 0,
  props: null as unknown as SelectedGenerationProps,
}));
vi.mock("react", () => ({
  useRef: (value: unknown) => {
    const index = context.cursor++;
    context.refs[index] ??= { current: value };
    return context.refs[index];
  },
}));
vi.mock("../src/review/useSelectedGeneration", () => ({
  useSelectedGeneration: (props: SelectedGenerationProps) => {
    context.props = props;
    return { busy: true, message: "A 요청의 실패 안내" };
  },
}));
beforeEach(() => {
  context.refs = [];
  context.cursor = 0;
});
function useForm(owner = { documentId: "doc", taskId: "A" }) {
  context.cursor = 0;
  const onSaved = vi.fn(),
    onBusy = vi.fn();
  const form = useSourceGeneration({
    ...owner,
    selection: {} as never,
    prepare: async () => {},
    onSaved,
    onBusy,
  });
  return { form, onSaved, onBusy, operation: context.props };
}
it("keeps completion and the busy lock attached to the same owner across view renders", () => {
  const first = useForm();
  first.operation.onBusy(true);
  const returned = useForm();
  first.operation.onSaved({ batchId: "result" } as never);
  expect(first.onSaved).toHaveBeenCalledOnce();
  expect(useForm().form.message).toBe("");
  expect(returned.form.busy).toBe(true);
  first.operation.onBusy(false);
  expect(first.onBusy.mock.calls).toEqual([[true], [false]]);
});
it.each([
  { documentId: "doc", taskId: "B" },
  { documentId: "other", taskId: "A" },
])("does not navigate a new owner after an old completion: %j", (owner) => {
  const first = useForm();
  first.operation.onBusy(true);
  const other = useForm(owner);
  first.operation.onSaved({ batchId: "old-result" } as never);
  expect(first.onSaved).not.toHaveBeenCalled();
  expect(other.onSaved).not.toHaveBeenCalled();
  expect(other.form.message).toBe("");
});
it("keeps the failure message available when returning to its owning task", () => {
  const first = useForm();
  first.operation.onBusy(true);
  expect(useForm({ documentId: "doc", taskId: "B" }).form.message).toBe("");
  expect(useForm().form.message).toBe("A 요청의 실패 안내");
});
