import type { DraftStore } from "../drafts/store";
import { draftError } from "../drafts/validation";
import type { DocumentSnapshot } from "../generated/DocumentSnapshot";
import type { TaskSnapshot } from "../generated/TaskSnapshot";
import type { RequestDraft } from "../generation/request-draft";
import { saveFirstSourceDraft } from "./source-request-store";
import {
  type CapturedSourceSelection,
  validateSourceSelection,
} from "./source-selection";
import { confirmedSourceTarget } from "./source-target";

export const DEFAULT_TASK_NAME = "새 작업";
export type FirstRequestDraft = RequestDraft & {
  taskId: string;
  name: string;
  goal: string;
  rules: string;
  scopeKind: "whole" | "section" | "selection";
  cursor: number;
  source?: CapturedSourceSelection;
  sourceAction?: boolean;
  handedOff?: boolean;
};
type FirstRequestIO = {
  isCurrent: () => boolean;
  flushDrafts: () => Promise<void>;
  saveSource: () => Promise<DocumentSnapshot>;
  putTask: (task: TaskSnapshot) => Promise<TaskSnapshot>;
  selectTask: (task: TaskSnapshot) => Promise<void>;
};
type Handoff = {
  key: string;
  draft: FirstRequestDraft;
  store: DraftStore;
  io: FirstRequestIO;
};
export async function handoffFirstRequest({ key, draft, store, io }: Handoff) {
  const error = draftError(draft.instruction);
  if (error) throw new Error(error);
  await io.flushDrafts();
  const head = await io.saveSource();
  validateFirstScope(draft, head.content);
  assertCurrent({ key, draft, store, io });
  const task = await io.putTask({
    id: draft.taskId,
    documentId: head.id,
    name: draft.name,
    goal: draft.goal,
    pinnedRules: draft.rules,
    summary: "",
  });
  assertCurrent({ key, draft, store, io });
  writeTaskDrafts(store, task, head, draft);
  await io.flushDrafts();
  assertCurrent({ key, draft, store, io });
  await io.selectTask(task);
  assertCurrent({ key, draft, store, io });
  store.write(key, { ...draft, handedOff: true });
  return task;
}
function writeTaskDrafts(
  store: DraftStore,
  task: TaskSnapshot,
  head: DocumentSnapshot,
  draft: FirstRequestDraft,
) {
  if (
    draft.sourceAction &&
    draft.source &&
    draft.mode === "PATCH" &&
    draft.scopeKind === "selection"
  ) {
    saveFirstSourceDraft(
      store,
      confirmedSourceTarget(head, task.id, draft.source),
      draft.instruction,
      true,
    );
  } else {
    store.write(JSON.stringify(["request", head.id, task.id]), {
      mode: draft.mode,
      editMode: draft.editMode,
      instruction: draft.instruction,
      instructions: draft.instructions,
      prepareOnOpen: true,
    });
  }
  store.write(JSON.stringify(["source-scope", head.id, task.id]), {
    kind: draft.scopeKind,
    cursor: draft.cursor,
    captured:
      draft.scopeKind === "selection" && draft.source
        ? { epoch: 0, value: draft.source }
        : null,
  });
}
export function firstRequestEntries(store: DraftStore, documentId: string) {
  return [...store.entries()].flatMap(([key, value]) => {
    if (!key.startsWith('["first-request",') || !value) return [];
    const parts: string[] = JSON.parse(key);
    return parts[1] === documentId && !(value as FirstRequestDraft).handedOff
      ? [{ key, value: value as FirstRequestDraft }]
      : [];
  });
}
export function firstRequestSeed(
  store: DraftStore,
  documentId: string,
  source?: CapturedSourceSelection,
  taskId?: string,
): { key: string; initial: FirstRequestDraft } {
  const saved = firstRequestEntries(store, documentId)
    .reverse()
    .find(
      ({ value }) =>
        (!taskId || value.taskId === taskId) &&
        (source
          ? value.sourceAction &&
            (!value.source ||
              JSON.stringify(value.source) === JSON.stringify(source))
          : true),
    );
  if (saved) return { key: saved.key, initial: saved.value };
  const temporaryId = crypto.randomUUID();
  return {
    key: JSON.stringify(["first-request", documentId, temporaryId]),
    initial: {
      taskId: temporaryId,
      mode: "PATCH",
      instruction: "",
      name: DEFAULT_TASK_NAME,
      goal: "",
      rules: "",
      scopeKind: source ? "selection" : "whole",
      cursor: source?.selection.cursor ?? 0,
      source,
      sourceAction: Boolean(source),
    } satisfies FirstRequestDraft,
  };
}

function assertCurrent({ key, draft, store, io }: Handoff) {
  if (!io.isCurrent() || store.peek(key) !== draft)
    throw new Error("화면 또는 입력이 바뀌었습니다. 최신 입력은 유지됩니다.");
}

function validateFirstScope(draft: FirstRequestDraft, source: string) {
  if (draft.mode === "REWRITE" || draft.scopeKind === "whole") return;
  if (draft.scopeKind === "selection" && !draft.source)
    throw new Error("원문에서 수정할 범위를 다시 선택해 주세요.");
  if (draft.source) validateSourceSelection(draft.source, source);
}
