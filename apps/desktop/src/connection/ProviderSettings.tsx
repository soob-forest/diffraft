import type { AiProvider } from "../generated/AiProvider";
import { ClaudeConnectionBody } from "./ClaudeConnectionBody";
import { CodexSettings } from "./CodexSettings";
import { useProviderSettings } from "./useProviderSettings";

type Props = { close: () => void; onBusy: (value: boolean) => void };
export function ProviderSettings({ close, onBusy }: Props) {
  const state = useProviderSettings(onBusy);
  const { prefs, provider, busy } = state;
  const saved = prefs && provider === prefs.provider;
  return (
    <>
      <h2 id="connection-title">AI 연결 설정</h2>
      <ProviderChoice state={state} />
      {saved &&
        (provider === "codex" ? (
          <CodexSettings
            prefs={prefs}
            saved={state.setPrefs}
            close={close}
            onBusy={state.setBusy}
          />
        ) : (
          <ClaudeConnectionBody close={close} onBusy={state.setBusy} />
        ))}
      {!saved && (
        <button type="button" disabled={busy} onClick={close}>
          설정 닫기
        </button>
      )}
    </>
  );
}

function ProviderChoice({
  state,
}: {
  state: ReturnType<typeof useProviderSettings>;
}) {
  const { prefs, provider, loading, busy, select, save } = state;
  return (
    <>
      <label htmlFor="ai-provider">사용할 공급자</label>
      <div className="connection-provider">
        <select
          id="ai-provider"
          value={provider}
          disabled={loading || busy || !prefs}
          onChange={(event) => select(event.target.value as AiProvider)}
        >
          <option value="codex">Codex (ChatGPT 계정)</option>
          <option value="claude">Claude Code</option>
        </select>
        <button
          type="button"
          disabled={loading || busy || !prefs || provider === prefs.provider}
          onClick={() => void save()}
        >
          공급자 설정 저장
        </button>
      </div>
      <ProviderFeedback state={state} />
    </>
  );
}

function ProviderFeedback({
  state,
}: {
  state: ReturnType<typeof useProviderSettings>;
}) {
  const { prefs, provider, loading } = state;
  return (
    <>
      {(loading || provider !== prefs?.provider || state.message) && (
        <p role="status">
          {loading
            ? "설정을 읽는 중…"
            : provider !== prefs?.provider
              ? "공급자를 변경했습니다. 저장 후 연결을 설정해 주세요."
              : state.message}
        </p>
      )}
      {state.error && <p role="alert">{state.error}</p>}
      {!prefs && !loading && (
        <button type="button" onClick={state.reload}>
          설정 다시 읽기
        </button>
      )}
    </>
  );
}
