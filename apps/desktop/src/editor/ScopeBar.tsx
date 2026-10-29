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
    ? `v${model.status.version} · 요청 확인 시 최신 원문으로 검증`
    : current
      ? `v${scope.version} · 선택 원문 ${scope.text.length.toLocaleString()}자`
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
  const [expanded, setExpanded] = useState(false);
  const selection = props.requestScope.selection;
  const heading =
    props.model.state.headings
      .filter((item) => item.fromUtf16 <= selection.cursor)
      .at(-1)?.title ?? "문서 시작";
  const summary =
    scope.kind === "whole"
      ? "전체 문서"
      : scope.kind === "section"
        ? `현재 섹션 · ${heading}`
        : selection.to > selection.from
          ? `선택 영역 · ${selection.to - selection.from}자`
          : "선택 영역이 없습니다. 원문에서 선택해 주세요.";
  return (
    <section className="scope-bar" aria-label="요청 범위">
      <div className="scope-heading">
        <strong>요청 범위</strong>
        <button
          type="button"
          aria-expanded={expanded}
          onClick={() => setExpanded((value) => !value)}
        >
          변경
        </button>
      </div>
      <span className="scope-summary">
        {summary} · v{props.model.status.version}
      </span>
      <div className="scope-editor" hidden={!expanded}>
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
      </div>
    </section>
  );
}
