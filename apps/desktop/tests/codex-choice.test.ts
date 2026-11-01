import { expect, it } from "vitest";
import {
  codexSelectionState,
  selectedCodexModel,
} from "../src/connection/codex-choice";
import type { AiPreferences } from "../src/generated/AiPreferences";
import type { CodexModelInfo } from "../src/generated/CodexModelInfo";

const models: CodexModelInfo[] = [
  {
    model: "fixture",
    label: "fixture",
    isDefault: true,
    effort: "low",
    supportedEfforts: ["low", "medium"],
  },
];
function prefs(effort: "ultra" | "medium"): AiPreferences {
  return {
    provider: "codex",
    codexPath: null,
    codexModel: { provider: "codex", model: "fixture", effort },
  };
}

it("offers explicit same-model repair without mutating the stored unsupported effort", () => {
  const saved = prefs("ultra");
  expect(codexSelectionState(saved, models, "fixture", "")).toEqual({
    repairEffort: "low",
    modelDirty: true,
    dirty: true,
  });
  expect(selectedCodexModel(saved.codexModel, models, "fixture")).toEqual({
    provider: "codex",
    model: "fixture",
    effort: "low",
  });
  expect(saved.codexModel).toEqual({
    provider: "codex",
    model: "fixture",
    effort: "ultra",
  });
});

it("preserves a supported pinned effort when the catalog default differs", () => {
  const saved = prefs("medium");
  expect(codexSelectionState(saved, models, "fixture", "")).toEqual({
    repairEffort: null,
    modelDirty: false,
    dirty: false,
  });
  expect(selectedCodexModel(saved.codexModel, models, "fixture")).toEqual(
    saved.codexModel,
  );
});

it("keeps stored choices after lookup failure and does not invent an effort", () => {
  const saved = prefs("ultra");
  expect(codexSelectionState(saved, [], "fixture", "").modelDirty).toBe(false);
  expect(selectedCodexModel(saved.codexModel, [], "fixture")).toEqual(
    saved.codexModel,
  );
  expect(() => selectedCodexModel(saved.codexModel, [], "unknown")).toThrow(
    "다시 조회",
  );
});

it("allows an explicit default and another model using only catalog values", () => {
  const saved = prefs("medium");
  expect(selectedCodexModel(saved.codexModel, models, "")).toBeNull();
  expect(codexSelectionState(saved, models, "", "").modelDirty).toBe(true);
  expect(
    selectedCodexModel(
      saved.codexModel,
      [{ ...models[0], model: "another" }],
      "another",
    ),
  ).toEqual({ provider: "codex", model: "another", effort: "low" });
});

it("does not enable a model save just because the executable path changed", () => {
  const saved = prefs("medium");
  expect(
    codexSelectionState(saved, models, "fixture", "/private/codex"),
  ).toEqual({ repairEffort: null, modelDirty: false, dirty: true });
});
