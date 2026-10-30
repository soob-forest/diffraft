import type { ModelSelection } from "../generated/ModelSelection";
import { MODEL_LABELS } from "./model";
import type { useModelSettings } from "./useModelSettings";
import "./model-settings.css";

export function ModelSettings({
  model,
  busy,
}: {
  model: ReturnType<typeof useModelSettings>;
  busy: boolean;
}) {
  return (
    <section className="model-settings" aria-labelledby="model-settings-title">
      <h3 id="model-settings-title">기본 모델</h3>
      <p id="model-help">
        설치·로그인 전에도 선택할 수 있습니다. 저장한 모델은 새 요청부터
        사용합니다.
      </p>
      <ModelControls model={model} busy={busy} />
      <p id="model-availability" className="muted">
        CLI 기본값은 Claude Code가 결정합니다. 모델 사용 가능 여부는 계정과 조직
        정책에 따라 달라집니다.
      </p>
      <p role="status">
        {model.loading
          ? "모델 설정을 읽는 중…"
          : model.message ||
            (model.saved !== null && model.selected !== model.saved
              ? "아직 저장하지 않은 선택입니다."
              : "")}
      </p>
      {model.error && <p role="alert">{model.error}</p>}
      {model.error && model.saved === null && (
        <button type="button" disabled={model.loading} onClick={model.reload}>
          모델 설정 다시 읽기
        </button>
      )}
    </section>
  );
}

function ModelControls({
  model,
  busy,
}: {
  model: ReturnType<typeof useModelSettings>;
  busy: boolean;
}) {
  return (
    <div className="model-settings-controls">
      <label htmlFor="default-model">새 요청에 사용할 모델</label>
      <select
        id="default-model"
        aria-describedby="model-help model-availability"
        value={model.selected}
        disabled={busy || model.loading || model.saving || model.saved === null}
        onChange={(event) => model.select(event.target.value as ModelSelection)}
      >
        {Object.entries(MODEL_LABELS).map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>
      <button
        type="button"
        disabled={
          busy ||
          model.loading ||
          model.saving ||
          model.saved === null ||
          (model.saved === model.selected && !model.error)
        }
        onClick={() => void model.save()}
      >
        {model.saving ? "저장 중…" : "모델 설정 저장"}
      </button>
    </div>
  );
}
