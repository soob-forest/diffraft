import { useEffect, useRef, useState } from "react";
import { errorMessage } from "../ipc";
import { editorCommand } from "./api";
import type { FlushRef } from "./DocumentWorkspace";

type Props = { documentId: string; flushRef: FlushRef };
function useCommonRules({ documentId, flushRef }: Props) {
  const state = useRulesState(documentId);
  const { value, setValue, saved, setSaved, message, setMessage } = state;
  const [busy, setBusy] = useState(false);
  const pending = useRef<Promise<void> | null>(null);
  const save = async () => {
    if (pending.current) return pending.current;
    if (saved === null)
      throw new Error("문서 공통 조건을 아직 불러오지 못했습니다.");
    if (value === saved) return;
    setBusy(true);
    pending.current = editorCommand(
      { kind: "common_rules", documentId, rules: value },
      "rules",
    ).then((rules) => {
      setSaved(rules);
      setMessage("문서 공통 조건을 저장했습니다.");
    });
    try {
      await pending.current;
    } finally {
      pending.current = null;
      setBusy(false);
    }
  };
  const latest = useRef(save);
  latest.current = save;
  useEffect(() => {
    flushRef.current = () => latest.current();
    return () => {
      flushRef.current = null;
    };
  }, [flushRef]);
  return {
    value,
    setValue,
    message,
    busy: busy || saved === null,
    save: () =>
      void save().catch((reason: unknown) => setMessage(errorMessage(reason))),
  };
}

function useRulesState(documentId: string) {
  const [value, setValue] = useState("");
  const [saved, setSaved] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  useEffect(() => {
    let active = true;
    editorCommand({ kind: "common_rules", documentId, rules: null }, "rules")
      .then((rules) => {
        if (active) {
          setValue(rules);
          setSaved(rules);
        }
      })
      .catch((reason: unknown) => {
        if (active) setMessage(errorMessage(reason));
      });
    return () => {
      active = false;
    };
  }, [documentId]);
  return { value, setValue, saved, setSaved, message, setMessage };
}

export function CommonRules(props: Props) {
  const form = useCommonRules(props);
  return (
    <details className="common-rules">
      <summary>문서 공통 조건</summary>
      <p>이 문서의 모든 작업에서 다음 요청부터 사용합니다.</p>
      <label>
        공통 용어·독자·문체
        <textarea
          rows={3}
          value={form.value}
          disabled={form.busy}
          onChange={(event) => form.setValue(event.target.value)}
        />
      </label>
      <button type="button" disabled={form.busy} onClick={form.save}>
        공통 조건 저장
      </button>
      <p role="status">{form.message}</p>
    </details>
  );
}
