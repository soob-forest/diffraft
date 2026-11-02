import { useRef, useState } from "react";
import { DraftLocked } from "../drafts/DraftRecovery";
import type { ScopeSnapshot } from "../generated/ScopeSnapshot";
import { errorMessage } from "../ipc";
import { confirmRequestScope } from "./confirm-request-scope";
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
      const { scope, captured } = await confirmRequestScope({
        model,
        requestScope,
      });
      if (sequence === latest.current) {
        if (captured) requestScope.capture(captured);
        setScope(scope);
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
  const summary = scopeSummary(props, scope.kind);
  return (
    <section className="scope-bar" aria-label="요청 범위">
      <DraftLocked locked={props.requestScope.locked} />
      <div className="scope-heading">
        <strong>요청 범위</strong>
        <button
          type="button"
          aria-expanded={expanded}
          disabled={props.requestScope.locked}
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
            disabled={props.requestScope.locked}
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
          disabled={props.requestScope.locked}
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

function scopeSummary(props: Props, kind: string) {
  const selection = props.requestScope.selection;
  const heading =
    props.model.state.headings
      .filter((item) => item.fromUtf16 <= selection.cursor)
      .at(-1)?.title ?? "문서 시작";
  return kind === "whole"
    ? "전체 문서"
    : kind === "section"
      ? `현재 섹션 · ${heading}`
      : selection.to > selection.from
        ? `선택 영역 · ${selection.to - selection.from}자`
        : "선택 영역이 없습니다. 원문에서 선택해 주세요.";
}
