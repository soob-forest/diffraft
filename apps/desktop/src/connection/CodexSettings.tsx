import { modelLabel } from "./provider";
import { type CodexSettingsProps, useCodexSettings } from "./useCodexSettings";

type Form = ReturnType<typeof useCodexSettings>;
export function CodexSettings(props: CodexSettingsProps) {
  const form = useCodexSettings(props);
  return (
    <>
      <h3>ChatGPT 계정으로 Codex 사용</h3>
      <p>
        공식 Codex의 기존 로그인을 사용합니다. 새 요청을 확인하기 전에 기본
        모델을 확정합니다.
      </p>
      <CodexStatus form={form} />
      <CodexActions form={form} close={props.close} />
      <CodexModel form={form} prefs={props.prefs} />
      <CodexPath form={form} />
      <p className="muted">
        설정 저장은 모델을 호출하지 않습니다. 연결 테스트·AI 요청은 사용 한도를
        소비할 수 있으며 중단해도 이미 처리된 사용량은 취소되지 않습니다.
      </p>
    </>
  );
}

function CodexStatus({ form }: { form: Form }) {
  const { state, dirty } = form;
  const status = state.operation
    ? state.cancelling
      ? "Codex 종료를 확인하는 중…"
      : "Codex에 연결하는 중…"
    : form.repairEffort
      ? "모델 설정을 저장한 뒤 연결을 테스트해 주세요."
      : state.tested && !dirty
        ? `연결 테스트 완료 · ${modelLabel(state.report?.testedModel ?? undefined)}`
        : state.report
          ? "ChatGPT 인증과 모델 목록을 확인했습니다. 실제 호출은 연결 테스트로 확인하세요."
          : "상태·모델 목록 조회로 Codex 설치와 인증을 확인하세요.";
  return (
    <>
      <p
        role="status"
        data-testid="connection-status"
        className={state.tested && !dirty ? "connection-success" : undefined}
      >
        {status}
      </p>
      {(form.error || state.error) && (
        <p role="alert">{form.error || state.error}</p>
      )}
    </>
  );
}

function CodexActions({ form, close }: { form: Form; close: () => void }) {
  const { busy, dirty, state } = form;
  const actions = [
    {
      label: "상태·모델 목록 조회",
      action: "inspect",
      disabled: busy || dirty,
    },
    { label: "ChatGPT 로그인 열기", action: "login", disabled: busy || dirty },
    {
      label: "연결 테스트",
      action: "test",
      disabled: busy || dirty || !state.report,
    },
  ] as const;
  return (
    <>
      <div className="connection-primary">
        {actions.map(({ label, action, disabled }) => (
          <button
            key={action}
            type="button"
            disabled={disabled}
            onClick={() => void state.run(action)}
          >
            {label}
          </button>
        ))}
        <button type="button" disabled={busy} onClick={close}>
          설정 닫기
        </button>
      </div>
      {state.operation && (
        <button
          type="button"
          disabled={state.cancelling}
          onClick={() => void state.cancel()}
        >
          연결 요청 중단
        </button>
      )}
    </>
  );
}

function CodexModel({
  form,
  prefs,
}: {
  form: Form;
  prefs: CodexSettingsProps["prefs"];
}) {
  return (
    <section className="model-settings" aria-label="Codex 기본 모델">
      <div className="model-settings-controls">
        <label htmlFor="codex-model">기본 모델</label>
        <CodexChoices form={form} prefs={prefs} />
        <button
          type="button"
          disabled={form.busy || !form.modelDirty}
          aria-describedby={
            form.repairEffort ? "codex-effort-repair" : undefined
          }
          onClick={() => void form.saveModel()}
        >
          모델 설정 저장
        </button>
      </div>
      <p>
        설치·로그인 전에도 Codex 기본값을 저장할 수 있습니다. 모델 목록 조회
        실패 시 저장된 선택은 유지합니다.
      </p>
      {form.repairEffort && (
        <p id="codex-effort-repair" role="status">
          현재 모델은 저장된 추론 수준을 지원하지 않습니다. 모델 설정을 저장하면
          이 모델의 기본값({form.repairEffort})으로 변경합니다.
        </p>
      )}
      {form.dirty && (
        <p role="status">
          저장하지 않은 변경이 있습니다. 저장 후 연결을 확인해 주세요.
        </p>
      )}
      <p role="status">{form.message}</p>
    </section>
  );
}

function CodexChoices({
  form,
  prefs,
}: {
  form: Form;
  prefs: CodexSettingsProps["prefs"];
}) {
  return (
    <select
      id="codex-model"
      disabled={form.busy}
      value={form.selected}
      onChange={(event) => form.select(event.target.value)}
    >
      <option value="">Codex 기본값</option>
      {prefs.codexModel &&
        !form.state.report?.models.some(
          (m) => m.model === prefs.codexModel?.model,
        ) && (
          <option value={prefs.codexModel.model}>
            {prefs.codexModel.model} (저장된 값)
          </option>
        )}
      {form.state.report?.models.map((model) => (
        <option key={model.model} value={model.model}>
          {model.label}
          {model.isDefault ? " · 기본" : ""}
        </option>
      ))}
    </select>
  );
}

function CodexPath({ form }: { form: Form }) {
  const report = form.state.report;
  return (
    <details className="connection-diagnostics">
      <summary>설치 경로·버전 진단 정보</summary>
      <label htmlFor="codex-path">Codex 실행 파일의 절대 경로</label>
      <input
        id="codex-path"
        value={form.path}
        disabled={form.busy}
        placeholder="자동 탐색"
        onChange={(event) => form.selectPath(event.target.value)}
      />
      <button
        type="button"
        disabled={form.busy || !form.path}
        onClick={() => void form.savePath()}
      >
        실행 경로 저장
      </button>
      {report && (
        <dl>
          <dt>실행 파일</dt>
          <dd>{report.executable}</dd>
          <dt>버전</dt>
          <dd>{report.version}</dd>
        </dl>
      )}
      <p>
        설치가 필요하면 공식 Codex CLI 안내를 따르세요. 터미널에서{" "}
        <code>codex login</code>으로 로그인한 뒤 상태를 다시 확인할 수도
        있습니다.
      </p>
    </details>
  );
}
