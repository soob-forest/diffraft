import type { AiPreferences } from "../generated/AiPreferences";
import type { CodexModelInfo } from "../generated/CodexModelInfo";
import type { ProviderModel } from "../generated/ProviderModel";

export function codexSelectionState(
  prefs: AiPreferences,
  models: CodexModelInfo[],
  selected: string,
  path: string,
) {
  const item = models.find((model) => model.model === selected);
  const saved = prefs.codexModel;
  const repairEffort =
    saved?.provider === "codex" &&
    saved.model === selected &&
    item &&
    !item.supportedEfforts.includes(saved.effort)
      ? item.effort
      : null;
  const modelDirty = selected !== (saved?.model ?? "") || repairEffort !== null;
  return {
    repairEffort,
    modelDirty,
    dirty: modelDirty || path !== (prefs.codexPath ?? ""),
  };
}

export function selectedCodexModel(
  saved: ProviderModel | null,
  models: CodexModelInfo[],
  selected: string,
): ProviderModel | null {
  if (!selected) return null;
  const item = models.find((model) => model.model === selected);
  if (
    saved?.provider === "codex" &&
    saved.model === selected &&
    (!item || item.supportedEfforts.includes(saved.effort))
  )
    return saved;
  if (item)
    return { provider: "codex", model: item.model, effort: item.effort };
  throw new Error("모델 목록을 다시 조회한 뒤 선택해 주세요.");
}
