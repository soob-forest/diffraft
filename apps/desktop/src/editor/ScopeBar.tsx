import { useRef, useState } from "react";
import type { ScopeSnapshot } from "../generated/ScopeSnapshot";
import { errorMessage } from "../ipc";
import { editorCommand } from "./api";
import type { RequestScope } from "./request-scope";
import type { DocumentModel } from "./useDocument";

type Props = { model: DocumentModel; requestScope: RequestScope };
function useScope({ model, requestScope }: Props) {
  const { kind, setKind } = requestScope;
  const [scope, setScope] = useState<ScopeSnapshot | null>(null);
  const [pinnedSelection, setPinnedSelection] = useState("");
  const selectionKey = JSON.stringify([kind, requestScope.selection]);
  const latest = useRef(0);
  const pin = async () => {
    const sequence = ++latest.current;
    try {
      const selection = requestScope.value();
      await model.autosave.flush();
      const value = await editorCommand(
        {
          kind: "scope",
          documentId: model.state.document.id,
          expectedVersion: model.autosave.document.version,
          selection,
        },
        "scope",
      );
      if (sequence === latest.current) {
        setScope(value);
        setPinnedSelection(selectionKey);
        model.setError("");
      }
    } catch (error) {
      model.setError(errorMessage(error));
    }
  };
  const current =
    scope?.version === model.status.version &&
    !model.status.dirty &&
    pinnedSelection === selectionKey;
  const label = !scope
    ? "저장한 원문을 기준으로 범위를 확인합니다."
    : current
      ? `v${scope.version} · ${scope.blocks.length}개 블록 선택됨`
      : "문서 또는 선택이 변경되어 범위를 다시 확인해야 합니다.";
  return {
    kind,
    label,
    pin,
    choose: (value: string) => {
      latest.current += 1;
      setKind(value);
      setScope(null);
    },
  };
}

export function ScopeBar(props: Props) {
  const scope = useScope(props);
  return (
    <section className="scope-bar" aria-label="요청 범위">
      <label>
        범위
        <select
          value={scope.kind}
          onChange={(event) => scope.choose(event.target.value)}
        >
          <option value="whole">전체 문서</option>
          <option value="section">현재 섹션</option>
          <option value="selection">선택 영역</option>
        </select>
      </label>
      <button
        type="button"
        onClick={() => {
          void scope.pin();
        }}
      >
        범위 확인
      </button>
      <span role="status">{scope.label}</span>
    </section>
  );
}
