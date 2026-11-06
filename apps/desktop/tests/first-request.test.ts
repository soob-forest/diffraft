import { expect, it } from "vitest";
import { DraftStore } from "../src/drafts/store";
import {
  type FirstRequestDraft,
  firstRequestEntries,
  firstRequestSeed,
  handoffFirstRequest,
} from "../src/editor/first-request";
import type { TaskSnapshot } from "../src/generated/TaskSnapshot";

const documentId = "00000000-0000-4000-8000-000000000001";
const taskId = "00000000-0000-4000-8000-000000000002";
const key = JSON.stringify(["first-request", documentId, taskId]);
const value: FirstRequestDraft = {
  taskId,
  mode: "EXPLAIN",
  instruction: "무슨 뜻인가요?",
  name: "새 작업",
  goal: "",
  rules: "",
  scopeKind: "whole",
  cursor: 0,
};
function fixture() {
  const store = new DraftStore();
  store.write(key, value);
  let calls = 0;
  const tasks = new Map();
  const io = {
    isCurrent: () => true,
    flushDrafts: async () => {},
    saveSource: async () =>
      ({
        id: documentId,
        content: "원문",
        version: 1,
        versionId: "head",
      }) as never,
    putTask: async (task: TaskSnapshot) => {
      calls++;
      tasks.set(taskId, task);
      return task;
    },
    selectTask: async () => {},
  };
  return { store, io, tasks, count: () => calls };
}
it("hands off explanation without turning its first instruction into a goal or automatically sending", async () => {
  const f = fixture();
  await handoffFirstRequest({ key, draft: value, store: f.store, io: f.io });
  expect(f.tasks.get(taskId)).toMatchObject({ goal: "", name: "새 작업" });
  expect(
    f.store.peek(JSON.stringify(["request", documentId, taskId])),
  ).toMatchObject({
    mode: "EXPLAIN",
    instruction: value.instruction,
    prepareOnOpen: true,
  });
  expect(firstRequestEntries(f.store, documentId)).toEqual([]);
  expect(f.store.peek(key)).toMatchObject({
    handedOff: true,
    instruction: value.instruction,
  });
});
it("keeps the original on failed handoff and retries with the same task ID", async () => {
  const f = fixture();
  let fail = true;
  f.io.flushDrafts = async () => {
    if (f.count() && fail) throw new Error("보관 실패");
  };
  await expect(
    handoffFirstRequest({ key, draft: value, store: f.store, io: f.io }),
  ).rejects.toThrow("보관 실패");
  expect(f.store.peek(key)).toBe(value);
  fail = false;
  await handoffFirstRequest({ key, draft: value, store: f.store, io: f.io });
  expect(f.tasks.size).toBe(1);
});
it("does not clear or select a newer input after a late save", async () => {
  const f = fixture();
  let selected = false;
  f.io.putTask = async (task) => {
    f.store.write(key, { ...value, instruction: "새 입력" });
    return task;
  };
  f.io.selectTask = async () => {
    selected = true;
  };
  await expect(
    handoffFirstRequest({ key, draft: value, store: f.store, io: f.io }),
  ).rejects.toThrow(/입력/);
  expect(f.store.peek(key)).toMatchObject({ instruction: "새 입력" });
  expect(selected).toBe(false);
});
it("retains input edited while the task selection acknowledgement is pending", async () => {
  const f = fixture();
  f.io.selectTask = async () => {
    f.store.write(key, { ...value, instruction: "선택 응답 중 새 입력" });
  };
  await expect(
    handoffFirstRequest({ key, draft: value, store: f.store, io: f.io }),
  ).rejects.toThrow(/입력/);
  expect(f.store.peek(key)).toMatchObject({
    instruction: "선택 응답 중 새 입력",
  });
});

it("does not create or select a task after the first composer changes owner", async () => {
  const f = fixture();
  f.io.saveSource = async () => {
    f.io.isCurrent = () => false;
    return {
      id: documentId,
      content: "원문",
      version: 1,
      versionId: "head",
    } as never;
  };
  await expect(
    handoffFirstRequest({ key, draft: value, store: f.store, io: f.io }),
  ).rejects.toThrow(/입력/);
  expect(f.count()).toBe(0);
  expect(f.store.peek(key)).toBe(value);
});
it("recovers the selected task's first draft rather than a newer different target", () => {
  const f = fixture();
  const otherId = "00000000-0000-4000-8000-000000000003";
  f.store.write(JSON.stringify(["first-request", documentId, otherId]), {
    ...value,
    taskId: otherId,
    instruction: "다른 대상",
  });
  expect(
    firstRequestSeed(f.store, documentId, undefined, taskId).initial.taskId,
  ).toBe(taskId);
});
const captured = {
  source: "원문",
  quote: "원",
  selection: { from: 0, to: 1, cursor: 1 },
};
it.each(["whole", "section"] as const)(
  "restores a source-entry draft after an explicit %s target change",
  (scopeKind) => {
    const f = fixture();
    const draft = { ...value, sourceAction: true, scopeKind, cursor: 1 };
    f.store.write(key, draft);
    const restored = firstRequestSeed(f.store, documentId, captured);
    expect(restored.key).toBe(key);
    expect(restored.initial).toBe(draft);
  },
);
it.each(["whole", "section"] as const)(
  "uses the explicit %s target after starting from a source selection",
  async (scopeKind) => {
    const f = fixture();
    const draft = {
      ...value,
      mode: "PATCH" as const,
      sourceAction: true,
      source: captured,
      scopeKind,
      cursor: 1,
    };
    f.store.write(key, draft);
    await handoffFirstRequest({ key, draft, store: f.store, io: f.io });
    expect(
      f.store.peek(JSON.stringify(["request", documentId, taskId])),
    ).toMatchObject({ mode: "PATCH" });
    expect(
      f.store.peek(JSON.stringify(["source-scope", documentId, taskId])),
    ).toMatchObject({ kind: scopeKind, captured: null, cursor: 1 });
  },
);
it("keeps whole rewrite independent of a previous source selection and retains the last editing method", async () => {
  const f = fixture();
  const draft = {
    ...value,
    mode: "REWRITE" as const,
    editMode: "REWRITE" as const,
    scopeKind: "selection" as const,
    source: { ...captured, source: "바뀌기 전 원문" },
  };
  f.store.write(key, draft);
  await handoffFirstRequest({ key, draft, store: f.store, io: f.io });
  expect(
    f.store.peek(JSON.stringify(["request", documentId, taskId])),
  ).toMatchObject({ mode: "REWRITE", editMode: "REWRITE" });
  const seed = firstRequestSeed(new DraftStore(), documentId, captured);
  expect(seed.initial.cursor).toBe(1);
});
