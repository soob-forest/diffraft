import { type ReactNode, useEffect, useRef, useState } from "react";
import { useDraftPersistence } from "../drafts/SessionDrafts";
import { draftError } from "../drafts/validation";
import type { TaskSnapshot } from "../generated/TaskSnapshot";
import { errorMessage } from "../ipc";
import { editorCommand } from "./api";
import type { FlushRef } from "./DocumentWorkspace";

export interface TaskFormProps {
  children?: ReactNode;
  task?: TaskSnapshot;
  documentId: string;
  flush: () => Promise<void>;
  onSaved: (task: TaskSnapshot) => void;
  flushRef: FlushRef;
}

function useTaskForm(props: TaskFormProps) {
  const [goal, setGoal] = useState(props.task?.goal ?? "");
  const [rules, setRules] = useState(props.task?.pinnedRules ?? "");
  const [firstInstruction, setFirstInstruction] = useState("");
  const operation = useTaskSave(props, goal, rules, firstInstruction);
  return {
    ...operation,
    dirty:
      goal !== (props.task?.goal ?? "") ||
      rules !== (props.task?.pinnedRules ?? ""),
    goal,
    setGoal,
    rules,
    setRules,
    firstInstruction,
    setFirstInstruction,
  };
}

function useTaskSave(
  props: TaskFormProps,
  goal: string,
  rules: string,
  firstInstruction: string,
) {
  const { store, flush } = useDraftPersistence();
  const { message, setMessage, error, setError, busy, setBusy, id, pending } =
    useTaskSaveState(props.task?.id);
  const save = async () => {
    if (pending.current) return pending.current;
    if (taskUnchanged(props, goal, rules)) return;
    setBusy(true);
    pending.current = persistTask({
      ...props,
      goal,
      rules,
      id: id.current,
      prepareRequest: (task) =>
        saveFirstRequest({
          task,
          existing: Boolean(props.task),
          instruction: firstInstruction,
          store,
          flush,
        }),
    });
    try {
      await pending.current;
      setMessage("작업 조건을 저장했습니다.");
      setError("");
    } catch (reason) {
      setError(errorMessage(reason));
      throw reason;
    } finally {
      pending.current = null;
      setBusy(false);
    }
  };
  useTaskFlush(props.flushRef, save);
  return {
    error,
    message,
    busy,
    submit: () => {
      void save().catch((error: unknown) => setMessage(errorMessage(error)));
    },
  };
}

async function persistTask(
  props: TaskFormProps & {
    goal: string;
    rules: string;
    id: string;
    prepareRequest: (task: TaskSnapshot) => Promise<void>;
  },
) {
  await props.flush();
  const task = {
    id: props.id,
    documentId: props.documentId,
    goal: props.goal,
    pinnedRules: props.rules,
    summary: "",
  };
  const saved = await editorCommand({ kind: "put_task", task }, "task");
  await props.prepareRequest(saved);
  await editorCommand(
    { kind: "select_task", documentId: props.documentId, taskId: saved.id },
    "selected_task",
  );
  props.onSaved(saved);
}

export function TaskForm(props: TaskFormProps) {
  const form = useTaskForm(props);
  return (
    <details
      className="task-condition-details"
      open={props.task ? undefined : true}
    >
      <TaskSummary form={form} existing={Boolean(props.task)} />
      {form.error && <p role="alert">{form.error}</p>}
      <p className="muted">
        목표는 계속 유지할 방향입니다. 이번에 바꿀 내용은 AI 요청에 적어 주세요.
        고정 조건은 선택 사항입니다.
      </p>
      <form
        className="task-conditions"
        onSubmit={(event) => {
          event.preventDefault();
          form.submit();
        }}
      >
        <TaskFields form={form} />
        {!props.task && (
          <label>
            첫 요청 (선택)
            <textarea
              rows={3}
              value={form.firstInstruction}
              onChange={(event) => form.setFirstInstruction(event.target.value)}
              disabled={form.busy}
              placeholder="예: 수치를 유지하고 이 안내를 간결하게 다듬어 주세요."
            />
          </label>
        )}
        {props.children}
        <button type="submit" disabled={form.busy}>
          {props.task
            ? "조건 저장"
            : form.firstInstruction.trim()
              ? "작업 만들고 요청 확인"
              : "작업 만들기"}
        </button>
        <p role="status">{form.message}</p>
      </form>
    </details>
  );
}
function TaskSummary({
  form,
  existing,
}: {
  form: ReturnType<typeof useTaskForm>;
  existing: boolean;
}) {
  return (
    <summary>
      <strong>작업 목표·조건</strong>
      <span className="condition-inline">
        {existing && (
          <span className="condition-summary">
            {form.rules || "고정 조건 없음"}
          </span>
        )}
        <span className="condition-edit">
          {existing ? "조건 편집" : "새 작업 만들기"}
          {form.dirty ? " · 저장 전 변경 있음" : ""}
          {form.error ? " · 저장 실패" : ""}
        </span>
      </span>
    </summary>
  );
}
function TaskFields({ form }: { form: ReturnType<typeof useTaskForm> }) {
  return (
    <>
      <label>
        작업 목표
        <textarea
          required
          disabled={form.busy}
          value={form.goal}
          onChange={(event) => form.setGoal(event.target.value)}
          placeholder="예: 여행 준비 안내를 명확하게"
          rows={3}
        />
      </label>
      <label>
        고정 조건
        <textarea
          disabled={form.busy}
          value={form.rules}
          onChange={(event) => form.setRules(event.target.value)}
          placeholder="예: 시간과 장소 이름 유지 (선택)"
          rows={3}
        />
      </label>
    </>
  );
}

function useTaskFlush(flushRef: FlushRef, save: () => Promise<void>) {
  const current = useRef(save);
  current.current = save;
  useEffect(() => {
    flushRef.current = () => current.current();
    return () => {
      flushRef.current = null;
    };
  }, [flushRef]);
}

async function saveFirstRequest({
  task,
  existing,
  instruction,
  store,
  flush,
}: {
  task: TaskSnapshot;
  existing: boolean;
  instruction: string;
  store: ReturnType<typeof useDraftPersistence>["store"];
  flush: () => Promise<void>;
}) {
  if (existing || !instruction.trim()) return;
  const error = draftError(instruction);
  if (error) throw new Error(error);
  store.write(JSON.stringify(["request", task.documentId, task.id]), {
    mode: "PATCH",
    instruction: instruction,
    prepareOnOpen: true,
  });
  await flush();
}

function useTaskSaveState(taskId: string | undefined) {
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const id = useRef(taskId ?? crypto.randomUUID());
  const pending = useRef<Promise<void> | null>(null);
  return { message, setMessage, error, setError, busy, setBusy, id, pending };
}

function taskUnchanged(props: TaskFormProps, goal: string, rules: string) {
  return (
    goal === (props.task?.goal ?? "") &&
    rules === (props.task?.pinnedRules ?? "")
  );
}
