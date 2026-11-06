import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { SourceRequestPanel } from "../src/editor/SourceRequestPanel";

const received = vi.hoisted(() => ({ props: {} as Record<string, unknown> }));
vi.mock("../src/editor/FirstRequest", () => ({
  FirstRequest: (props: Record<string, unknown>) => {
    received.props = props;
    return null;
  },
}));
vi.mock("../src/editor/SourceOverlapNotice", () => ({
  useSourceOverlaps: () => ({ blocked: false }),
  SourceOverlapNotice: () => null,
}));
it("connects the first source request's document conditions to the workspace leave flush", () => {
  const conditions = { current: vi.fn() },
    scope = {};
  const request = {
    firstConditions: conditions,
    form: { busy: false },
    selection: { draft: { value: { target: null, prepared: null } } },
  };
  renderToStaticMarkup(
    createElement(SourceRequestPanel, {
      request,
      scope,
      taskId: "",
      model: { state: { tasks: [] } },
      onOverlap: vi.fn(),
    } as never),
  );
  expect(received.props.conditionFlush).toBe(conditions);
  expect(received.props.scope).toBe(scope);
});
