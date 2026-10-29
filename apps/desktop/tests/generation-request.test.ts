import { invoke } from "@tauri-apps/api/core";
import { beforeEach, expect, it, vi } from "vitest";
import { Autosave } from "../src/editor/autosave";
import { OperationGate } from "../src/editor/operation-gate";
import type { DocumentSnapshot } from "../src/generated/DocumentSnapshot";
import { sendRequest } from "../src/generation/api";
import {
  type GenerationProps,
  prepareRequest,
} from "../src/generation/request";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
const initial: DocumentSnapshot = {
  id: "document",
  title: "문서",
  path: "/fixture.md",
  versionId: "v1",
  version: 1,
  content: "원문",
  contentHash: "hash",
  status: "READY",
};
function setup() {
  const order: string[] = [];
  const save = vi.fn(async () => {
    order.push("document");
    return { ...initial, versionId: "v2", version: 2, content: "최신 원문" };
  });
  const autosave = new Autosave(initial, save, () => {});
  const flush = vi.fn(async () => {
    order.push("conditions");
  });
  const model: GenerationProps["model"] = {
    autosave,
    gate: new OperationGate(() => {}),
    mutating: false,
    state: {
      document: initial,
      tasks: [],
      selectedTaskId: null,
      headings: [],
      versions: [],
    },
    taskSaved: vi.fn(),
    content: initial.content,
    status: autosave.status,
    error: "",
    setError: vi.fn(),
    editorInitial: initial.content,
    editorEpoch: 0,
    adoptSaved: vi.fn(),
    relocateSaved: vi.fn(),
    change: vi.fn(),
  };
  const props: GenerationProps = {
    model,
    taskId: "task",
    taskFlush: { current: flush },
    onProposal: vi.fn(),
    scope: {
      kind: "whole",
      setKind: vi.fn(),
      selection: { from: 0, to: 0, cursor: 0 },
      setSelection: vi.fn(),
      value: () => ({ kind: "whole" }),
    },
  };
  vi.mocked(invoke).mockImplementation(async (name) => {
    order.push(name);
    if (name === "model_settings_command") return "sonnet";
    if (name === "editor_command")
      return { kind: "scope", value: { text: "최신 원문", version: 2 } };
    if (name === "review_command")
      return { kind: "state", value: { batches: [], generating: false } };
    return { kind: "explain", value: "설명" };
  });
  return { props, order, save, flush };
}
beforeEach(() => vi.resetAllMocks());

it("rejects invalid instructions before writing source or conditions", async () => {
  const { props, save, flush } = setup();
  props.model.autosave.change("최신 원문");
  for (const instruction of [" ", "잘못된\0입력", "한".repeat(6000)]) {
    await expect(prepareRequest(props, "PATCH", instruction)).rejects.toThrow();
  }
  expect(save).not.toHaveBeenCalled();
  expect(flush).not.toHaveBeenCalled();
  expect(invoke).not.toHaveBeenCalled();
  props.model.autosave.dispose();
});

it("does not confirm a request during IME composition", async () => {
  const { props, flush } = setup();
  props.model.autosave.composition(true);
  await expect(prepareRequest(props, "PATCH", "수정")).rejects.toThrow();
  expect(flush).not.toHaveBeenCalled();
  expect(invoke).not.toHaveBeenCalled();
});

it("saves source and conditions before scope confirmation, and sends only after confirmation", async () => {
  const { props, order } = setup();
  props.model.autosave.change("최신 원문");
  const pending = await prepareRequest(props, "EXPLAIN", "설명해 주세요");
  expect(order).toEqual([
    "document",
    "conditions",
    "editor_command",
    "review_command",
    "model_settings_command",
  ]);
  expect(pending.request.expectedHeadId).toBe("v2");
  expect(pending.request.archivePrevious).toBe(false);
  expect(pending.request.model).toBe("sonnet");
  expect(await sendRequest({ kind: "generate", value: pending.request })).toBe(
    "explanation",
  );
  expect(order.at(-1)).toBe("generate_document");
});
it("does not inspect or generate after either source or conditions fail to save", async () => {
  const first = setup();
  first.save.mockRejectedValueOnce(new Error("원문 저장 실패"));
  first.props.model.autosave.change("최신 원문");
  await expect(prepareRequest(first.props, "PATCH", "수정")).rejects.toThrow(
    "원문 저장 실패",
  );
  expect(first.flush).not.toHaveBeenCalled();
  expect(invoke).not.toHaveBeenCalled();
  const second = setup();
  second.flush.mockRejectedValueOnce(new Error("조건 저장 실패"));
  await expect(prepareRequest(second.props, "PATCH", "수정")).rejects.toThrow(
    "조건 저장 실패",
  );
  expect(invoke).not.toHaveBeenCalled();
});
it("keeps the document gate locked until all condition writes complete", async () => {
  const { props, flush } = setup();
  let finish = () => {};
  flush.mockReturnValueOnce(
    new Promise<void>((resolve) => {
      finish = resolve;
    }),
  );
  const pending = prepareRequest(props, "PATCH", "수정");
  expect(() => props.model.gate.assertIdle()).toThrow(/처리/);
  finish();
  await pending;
  expect(() => props.model.gate.assertIdle()).not.toThrow();
});
