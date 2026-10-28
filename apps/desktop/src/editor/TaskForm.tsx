import { useEffect, useRef, useState } from "react";
import type { TaskSnapshot } from "../generated/TaskSnapshot";
import { errorMessage } from "../ipc";
import { editorCommand } from "./api";
import type { FlushRef } from "./DocumentWorkspace";

export interface TaskFormProps {
  task?: TaskSnapshot;
  documentId: string;
  flush: () => Promise<void>;
  onSaved: (task: TaskSnapshot) => void;
  flushRef: FlushRef;
}

function useTaskForm(props: TaskFormProps) {
  const [goal, setGoal] = useState(props.task?.goal ?? "");
  const [rules, setRules] = useState(props.task?.pinnedRules ?? "");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const id = useRef(props.task?.id ?? crypto.randomUUID());
  const pending = useRef<Promise<void> | null>(null);
  const save = async () => {
    if (pending.current) return pending.current;
    if (
      goal === (props.task?.goal ?? "") &&
      rules === (props.task?.pinnedRules ?? "")
    )
      return;
    setBusy(true);
    pending.current = persistTask({ ...props, goal, rules, id: id.current });
    try {
      await pending.current;
      setMessage("작업 조건을 저장했습니다.");
    } finally {
      pending.current = null;
      setBusy(false);
    }
  };
  const current = useRef(save);
  current.current = save;
  useEffect(() => {
    props.flushRef.current = () => current.current();
    return () => {
      props.flushRef.current = null;
    };
  }, [props.flushRef]);
  return {
    goal,
    setGoal,
    rules,
    setRules,
    message,
    busy,
    submit: () => {
      void save().catch((error: unknown) => setMessage(errorMessage(error)));
    },
  };
}

async function persistTask(
  props: TaskFormProps & { goal: string; rules: string; id: string },
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
  await editorCommand(
    { kind: "select_task", documentId: props.documentId, taskId: saved.id },
    "selected_task",
  );
  props.onSaved(saved);
}

export function TaskForm(props: TaskFormProps) {
  const form = useTaskForm(props);
  return (
    <form
      className="task-conditions"
      onSubmit={(event) => {
        event.preventDefault();
        form.submit();
      }}
    >
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
          placeholder="예: 시간과 장소 이름 유지"
          rows={5}
        />
      </label>
      <button type="submit" disabled={form.busy}>
        {props.task ? "조건 저장" : "작업 만들기"}
      </button>
      <p role="status">{form.message}</p>
    </form>
  );
}
