import { expect, it } from "vitest";
import { taskChoiceLabels } from "../src/editor/task-choice-labels";
import {
  requestLabels,
  requestTargetLabel,
} from "../src/generation/request-labels";

it("keeps the confirmed source kind, section and Unicode selection explicit", () => {
  const pending = {
    kind: "generate",
    request: { selection: { kind: "section" } },
    scope: {
      version: 7,
      blocks: [{ headingPath: ["문서", "확인 시간"] }],
      text: "한글 😀",
    },
  };
  expect(requestTargetLabel(pending as never)).toBe(
    "현재 섹션 · 확인 시간 · v7",
  );
  pending.request.selection.kind = "selection";
  expect(requestTargetLabel(pending as never)).toBe("선택한 원문 4자 · v7");
  pending.request.selection.kind = "whole";
  expect(requestTargetLabel(pending as never)).toBe("확정본 전체 · v7");
  expect(requestLabels.EXPLAIN).toBe("질문하기");
});
it("disambiguates duplicate task labels without changing identifiers or stored names", () => {
  const tasks = [
    { id: "one", name: "새 작업", goal: "방향" },
    { id: "two", name: "새 작업", goal: "" },
    { id: "three", goal: "기존 목표" },
  ];
  const before = structuredClone(tasks);
  const choices = taskChoiceLabels(tasks as never);
  expect(new Set(choices.map((choice) => choice.label)).size).toBe(3);
  expect(choices.map((choice) => choice.id)).toEqual(["one", "two", "three"]);
  expect(choices[2].label).toBe("기존 목표");
  expect(tasks).toEqual(before);
});
