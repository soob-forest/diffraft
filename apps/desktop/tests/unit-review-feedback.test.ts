import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import {
  UnitReviewTools,
  type UnitToolsProps,
} from "../src/review/UnitReviewTools";
import { projection } from "./support/review-projection";

vi.mock("../src/review/UnitReviewMenu", () => ({ UnitReviewMenu: () => null }));

function markup(options: {
  notice?: string;
  noticeImportant?: boolean;
  error?: string;
  message?: string;
  messageKind?: string;
}) {
  const props = {
    projection: projection([]),
    panel: {
      review: { error: options.error ?? "" },
      actions: {
        message: options.message ?? "",
        messageKind: options.messageKind ?? "status",
      },
    },
    navigation: {
      units: [],
      value: { filter: "pending", original: false },
      selected: undefined,
    },
    title: { current: null },
    blocked: false,
    notice: options.notice ?? "",
    noticeImportant: options.noticeImportant ?? false,
  } as unknown as UnitToolsProps;
  return renderToStaticMarkup(createElement(UnitReviewTools, props));
}

it("keeps review read failures outside the compact progress feedback", () => {
  const html = markup({ error: "검토 내용을 불러오지 못했습니다." });
  expect(html).toContain('class="unit-review-alert"');
  expect(html).toContain('role="alert"');
  expect(html).toContain("검토 내용을 불러오지 못했습니다.");
});

it("shows the reason approval is locked without opening review tools", () => {
  const html = markup({
    notice: "문서 기준이 바뀌어 승인할 수 없습니다.",
    noticeImportant: true,
  });
  expect(html).toContain('class="unit-review-alert"');
  expect(html).toContain('role="alert"');
});

it("keeps action failures and cancellation notices visible even with passive history text", () => {
  const html = markup({
    notice: "이전 검토 · 읽기 전용",
    message: "승인 요청을 완료하지 못했습니다.",
    messageKind: "attention",
  });
  expect(html).toContain('class="unit-review-alert"');
  expect(html).toContain("승인 요청을 완료하지 못했습니다.");
});

it("preserves compact success and read-only progress messages", () => {
  for (const options of [
    { message: "변경 1 승인 완료 · v15 저장됨" },
    { notice: "이전 검토 · 읽기 전용" },
  ]) {
    const html = markup(options);
    expect(html).toContain('class="unit-feedback"');
    expect(html).toContain('role="status"');
    expect(html).not.toContain('class="unit-review-alert"');
  }
});
