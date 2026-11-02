import { expect, it } from "vitest";
import {
  importConflicts,
  importRequest,
  originalRequest,
  switchRequestMode,
} from "../src/generation/request-draft";

it("keeps distinct instructions when switching between patch, explain and rewrite", () => {
  const patch = { mode: "PATCH" as const, instruction: "수치를 유지" };
  const explain = switchRequestMode(patch, "EXPLAIN");
  expect(explain.instruction).toBe("");
  const rewrite = switchRequestMode(
    { ...explain, instruction: "이유 설명" },
    "REWRITE",
  );
  const restored = switchRequestMode(
    { ...rewrite, instruction: "전체 구조 변경" },
    "PATCH",
  );
  expect(restored.instruction).toBe("수치를 유지");
  expect(switchRequestMode(restored, "EXPLAIN").instruction).toBe("이유 설명");
  expect(switchRequestMode(restored, "REWRITE").instruction).toBe(
    "전체 구조 변경",
  );
});

it.each(["PATCH", "EXPLAIN", "REWRITE"] as const)(
  "restores %s with explicit destination conflict detection",
  (mode) => {
    const saved = {
      kind: mode === "REWRITE" ? "rewrite" : "generate",
      value: { mode, instruction: "실패 지시" },
    };
    const imported = originalRequest(saved as never, "PATCH");
    const current = {
      mode: "EXPLAIN" as const,
      instruction: "설명 보존",
      instructions: { PATCH: "수정 보존", REWRITE: "재작성 보존" },
    };
    expect(importConflicts(current, imported)).toBe(true);
    expect(current.instruction).toBe("설명 보존");
    const restored = importRequest(current, imported);
    expect(restored).toMatchObject({
      mode,
      instruction: "실패 지시",
      pending: null,
      prepareOnOpen: false,
    });
    for (const other of ["PATCH", "EXPLAIN", "REWRITE"] as const) {
      if (other !== mode)
        expect(switchRequestMode(restored, other).instruction).toBe(
          switchRequestMode(current, other).instruction,
        );
    }
    expect(importConflicts(restored, imported)).toBe(false);
  },
);
