import { type ReactNode, useEffect, useRef, useState } from "react";
import type { TaskSnapshot } from "../generated/TaskSnapshot";
import { requestInputChanged } from "../generation/request-invalidation";
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
export function TaskForm(props: TaskFormProps) {
  const form = useTaskForm(props);
  return (
    <details className="task-condition-details">
      <summary>
        <strong>계속 참고할 조건 (선택)</strong>
        <span className="condition-inline">
          {form.dirty && "저장 전 변경 있음"}
          {form.error && " · 저장 실패"}
        </span>
      </summary>
      <p className="muted">
        방향과 조건은 이 작업의 다음 요청부터 참고합니다. 조건이 지켜졌는지는
        승인 전에 확인하세요.
      </p>
      <form
        className="task-conditions"
        onChange={requestInputChanged}
        onSubmit={(event) => {
          event.preventDefault();
          void form.save().catch(() => {});
        }}
      >
        <TaskFields form={form} />
        {props.children}
        <button type="submit" disabled={form.busy}>
          조건 저장
        </button>
        {form.error && <p role="alert">{form.error}</p>}
        <p role="status">{form.message}</p>
      </form>
    </details>
  );
}
function useTaskForm(props: TaskFormProps) {
  const [name, setName] = useState(taskDisplayName(props.task));
  const [goal, setGoal] = useState(props.task?.goal ?? ""),
    [rules, setRules] = useState(props.task?.pinnedRules ?? "");
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const dirty =
    name !== taskDisplayName(props.task) ||
    goal !== (props.task?.goal ?? "") ||
    rules !== (props.task?.pinnedRules ?? "");
  const operation = useTaskSave(
    props,
    { name, goal, rules, dirty },
    { setBusy, setError, setMessage },
  );
  return {
    name,
    setName,
    goal,
    setGoal,
    rules,
    setRules,
    busy,
    error,
    message,
    save: operation,
    dirty,
  };
}
function taskDisplayName(task?: TaskSnapshot) {
  return task?.name ?? task?.goal ?? "새 작업";
}
async function saveConditions(props: TaskFormProps, task: TaskSnapshot) {
  await props.flush();
  props.onSaved(await editorCommand({ kind: "put_task", task }, "task"));
}

function TaskFields({ form }: { form: ReturnType<typeof useTaskForm> }) {
  return (
    <>
      {" "}
      <label>
        작업 이름
        <input
          data-testid="task-name"
          required
          value={form.name}
          disabled={form.busy}
          onChange={(event) => form.setName(event.target.value)}
        />
      </label>
      <label>
        이 작업에서 계속 참고할 방향
        <textarea
          data-testid="task-goal"
          rows={2}
          value={form.goal}
          disabled={form.busy}
          onChange={(event) => form.setGoal(event.target.value)}
        />
      </label>
      <label>
        이 작업에서 유지할 조건
        <textarea
          rows={2}
          value={form.rules}
          disabled={form.busy}
          onChange={(event) => form.setRules(event.target.value)}
        />
      </label>
    </>
  );
}

function useTaskSave(
  props: TaskFormProps,
  value: { name: string; goal: string; rules: string; dirty: boolean },
  state: {
    setBusy: (value: boolean) => void;
    setError: (value: string) => void;
    setMessage: (value: string) => void;
  },
) {
  const { name, goal, rules, dirty } = value;
  const { setBusy, setError, setMessage } = state;
  const pending = useRef<Promise<void> | null>(null);
  const save = () => {
    if (pending.current) return pending.current;
    if (!props.task || !dirty) return Promise.resolve();
    setBusy(true);
    const task = { ...props.task, name, goal, pinnedRules: rules, summary: "" };
    pending.current = saveConditions(props, task)
      .then(
        () => {
          setError("");
          setMessage("조건을 저장했습니다. 다음 요청부터 사용합니다.");
        },
        (reason) => {
          setError(errorMessage(reason));
          throw reason;
        },
      )
      .finally(() => {
        pending.current = null;
        setBusy(false);
      });
    return pending.current;
  };
  const latest = useRef(save);
  latest.current = save;
  useEffect(() => {
    props.flushRef.current = () => latest.current();
    return () => {
      props.flushRef.current = null;
    };
  }, [props.flushRef]);
  return save;
}
