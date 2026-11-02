import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { CommentNextStep } from "../src/review/CommentForm";

it("blocks the next action while unsaved text or a save remains, and enables it after saving", () => {
  const render = (text: string, busy = false) =>
    renderToStaticMarkup(
      createElement(CommentNextStep, {
        blocked: false,
        busy,
        text,
        onNext: () => {
          throw new Error("render must not navigate");
        },
      }),
    );
  expect(render("저장 전 의견")).toContain('disabled=""');
  expect(render("", true)).toContain('disabled=""');
  expect(render("")).not.toContain('disabled=""');
});

import { createElement } from "react";
