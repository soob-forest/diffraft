import { useEffect, useMemo, useRef, useState } from "react";
import { DraftLocked, DraftRecovery } from "../drafts/DraftRecovery";
import { useDraftPersistence, useSessionDraft } from "../drafts/SessionDrafts";
import type { TaskSnapshot } from "../generated/TaskSnapshot";
import { RequestForm } from "../generation/RequestForm";
import { switchRequestMode } from "../generation/request-draft";
import { errorMessage } from "../ipc";
import { editorCommand } from "./api";
import { CommonRules } from "./CommonRules";
import { FirstConditions } from "./FirstConditions";
import { firstRequestSeed, handoffFirstRequest } from "./first-request";
import type { RequestScope } from "./request-scope";
import {
  type CapturedSourceSelection,
  captureSourceSelection,
} from "./source-selection";
import type { DocumentModel } from "./useDocument";

type Props = {
  model: DocumentModel;
  scope?: RequestScope;
  source?: CapturedSourceSelection;
  taskId?: string;
  onTask: (task: TaskSnapshot) => void;
  conditionFlush?: React.RefObject<(() => Promise<void>) | null>;
};
export function FirstRequest(props: Props) {
  const context = useDraftPersistence();
  const { store, persistence } = context;
  const seed = useMemo(
    () =>
      firstRequestSeed(
        store,
        props.model.state.document.id,
        props.source,
        props.taskId,
      ),
    [store, props.model.state.document.id, props.source, props.taskId],
  );
  const draft = useSessionDraft(seed.key, seed.initial);
  const operation = useFirstPreparation(props, context, draft, seed.key);
  const value = draft.value;
  return (
    <section className="generation-panel first-request" aria-label="첫 AI 요청">
      <h3>AI에게 요청하기</h3>
      <p className="muted">
        원하는 내용을 한 번 적어 주세요. 확인 전에는 AI를 실행하지 않습니다.
      </p>
      <DraftLocked locked={draft.locked} />
      <RequestForm
        blocked={
          draft.locked || operation.busy || Boolean(props.model.status.error)
        }
        form={firstForm(draft, operation)}
      >
        <FirstTarget {...props} value={value} set={draft.set} />
      </RequestForm>
      <FirstConditions value={value} set={(next) => draft.set(next)}>
        <CommonRules
          documentId={props.model.state.document.id}
          flushRef={operation.conditions}
        />
      </FirstConditions>
      {operation.message && <p role="alert">{operation.message}</p>}
      <DraftRecovery persistence={persistence} />
    </section>
  );
}
function useFirstPreparation(
  props: Props,
  context: ReturnType<typeof useDraftPersistence>,
  draft: ReturnType<typeof useSessionDraft<FirstValue>>,
  key: string,
) {
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const owner = useRef(key);
  owner.current = key;
  const lock = useRef(false),
    active = useRef(true),
    conditions = useRef<(() => Promise<void>) | null>(null);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
      queueMicrotask(() => clearFirstHandoff(context.store, key));
    };
  }, [context.store, key]);
  const conditionFlush = props.conditionFlush ?? conditions;
  const prepare = async () => {
    if (lock.current || draft.locked) return;
    lock.current = true;
    setBusy(true);
    setMessage("");
    try {
      const task = await beginFirstRequest(
        props.model.gate,
        key,
        draft.value,
        context.store,
        firstIO(
          props,
          context,
          conditionFlush,
          () => active.current && owner.current === key,
        ),
      );
      if (active.current && owner.current === key) props.onTask(task);
      else clearFirstHandoff(context.store, key);
    } catch (reason) {
      if (active.current && owner.current === key)
        setMessage(errorMessage(reason));
    } finally {
      lock.current = false;
      if (active.current) setBusy(false);
    }
  };
  return { busy, message, prepare, conditions: conditionFlush };
}
type FirstValue = ReturnType<typeof firstRequestSeed>["initial"];
function FirstScope({
  model,
  scope,
  value,
  set,
}: Props & { value: FirstValue; set: (value: FirstValue) => void }) {
  const [error, setError] = useState("");
  return (
    <section className="scope-bar" aria-label="요청 대상">
      <strong>
        대상 ·{" "}
        {value.scopeKind === "whole"
          ? "확정본 전체"
          : value.scopeKind === "section"
            ? `현재 섹션 · ${model.state.headings.filter((heading) => heading.fromUtf16 <= value.cursor).at(-1)?.title ?? "문서 시작"}`
            : "선택한 원문"}{" "}
        · v{model.status.version}
      </strong>
      {value.source && value.scopeKind === "selection" && (
        <blockquote>{value.source.quote}</blockquote>
      )}
      <label>
        대상 변경
        <select
          value={value.scopeKind}
          onChange={(event) => {
            const kind = event.target.value as FirstValue["scopeKind"];
            try {
              set(chooseFirstScope({ model, scope, value }, kind));
              setError("");
            } catch (reason) {
              setError(errorMessage(reason));
            }
          }}
        >
          <option value="whole">확정본 전체</option>
          <option value="section">현재 섹션</option>
          <option value="selection">선택한 원문</option>
        </select>
      </label>
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
function firstForm(
  draft: ReturnType<typeof useSessionDraft<FirstValue>>,
  operation: ReturnType<typeof useFirstPreparation>,
) {
  return {
    mode: draft.value.mode,
    editMode: draft.value.editMode,
    question: undefined,
    referenceBatchId: undefined,
    instruction: draft.value.instruction,
    locked: draft.locked,
    busy: operation.busy,
    setMode: (mode: FirstValue["mode"]) =>
      draft.update((current) => ({
        ...current,
        ...switchRequestMode(current, mode),
      })),
    setInstruction: (instruction: string) =>
      draft.update((current) => ({ ...current, instruction, pending: null })),
    prepare: operation.prepare,
  };
}

function firstIO(
  props: Props,
  context: ReturnType<typeof useDraftPersistence>,
  conditions: React.RefObject<(() => Promise<void>) | null>,
  isCurrent: () => boolean,
) {
  return {
    isCurrent,
    flushDrafts: context.flush,
    saveSource: async () => {
      await props.model.autosave.flush();
      await conditions.current?.();
      return props.model.autosave.document;
    },
    putTask: (task: TaskSnapshot) =>
      editorCommand({ kind: "put_task", task }, "task"),
    selectTask: (task: TaskSnapshot) =>
      editorCommand(
        { kind: "select_task", documentId: task.documentId, taskId: task.id },
        "selected_task",
      ).then(() => {}),
  };
}

function chooseFirstScope(
  {
    model,
    scope,
    value,
  }: Pick<Props, "model" | "scope"> & { value: FirstValue },
  kind: FirstValue["scopeKind"],
): FirstValue {
  const source =
    kind === "selection"
      ? captureSourceSelection(
          model.content,
          scope?.dragSelection ??
            value.source?.selection ?? { from: 0, to: 0, cursor: 0 },
        )
      : undefined;
  return {
    ...value,
    scopeKind: kind,
    source,
    cursor:
      scope?.dragSelection.cursor ??
      value.source?.selection.cursor ??
      value.cursor,
  };
}

function FirstTarget(
  props: Props & { value: FirstValue; set: (value: FirstValue) => void },
) {
  const { value, set } = props;
  return (
    <>
      {" "}
      {value.mode === "REWRITE" ? (
        <strong>대상 · 확정본 전체 · v{props.model.status.version}</strong>
      ) : (
        <FirstScope {...props} value={value} set={set} />
      )}
      <p className="request-effects">
        {value.mode === "EXPLAIN"
          ? "답변만 대화에 저장합니다. 문서와 결정은 바꾸지 않습니다."
          : "새 제안은 별도 승인 전까지 확정본에 반영되지 않습니다."}
      </p>
    </>
  );
}

function clearFirstHandoff(
  store: ReturnType<typeof useDraftPersistence>["store"],
  key: string,
) {
  const saved = store.peek(key) as FirstValue | undefined;
  if (saved?.handedOff) store.clear(key, saved);
}

function beginFirstRequest(
  gate: DocumentModel["gate"],
  key: string,
  draft: FirstValue,
  store: ReturnType<typeof useDraftPersistence>["store"],
  io: ReturnType<typeof firstIO>,
) {
  return gate.run(() => handoffFirstRequest({ key, draft, store, io }));
}
