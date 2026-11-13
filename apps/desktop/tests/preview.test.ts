import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DocumentOutline } from "../src/editor/DocumentOutline";
import Preview, { safePreviewUrl } from "../src/editor/Preview";

describe("safe Markdown preview", () => {
  it("does not render executable HTML or load any image", () => {
    const content =
      '<script>alert(1)</script>\n\n<img src="https://example.com/pixel" onerror="alert(2)">\n\n![사진](https://example.com/track.png)\n\n[실행](javascript:alert%281%29)';
    const html = renderToStaticMarkup(
      createElement(Preview, { content, onOpen: () => {} }),
    );
    expect(html).not.toMatch(
      /<script|<img|onerror|javascript:|track\.png|pixel/,
    );
    expect(html).toContain("이미지: 사진");
  });
  it("allows only explicit web/mail links and document anchors", () => {
    for (const href of [
      "file:///etc/passwd",
      "data:text/html,x",
      "javascript:alert(1)",
      "https://u:p@example.com",
      "https://example.com\n",
      "//example.com",
    ])
      expect(safePreviewUrl(href)).toBe("");
    expect(safePreviewUrl("https://example.com")).toBe("https://example.com/");
    expect(safePreviewUrl("#제목")).toBe("#제목");
  });
});

it.each(["", "\uFEFF"])(
  "preserves raw UTF-16 heading positions with prefix %j",
  (prefix) => {
    const content =
      prefix +
      "# 한글 😀\r\n\r\n## **같은 제목**\r\n\r\n```md\r\n## 가짜 제목\r\n```\r\n\r\n같은 제목\r\n---------\r\n";
    const html = renderToStaticMarkup(
      createElement(Preview, { content, onOpen: () => {} }),
    );
    const offsets = [...html.matchAll(/data-heading-offset="(\d+)"/g)].map(
      (match) => Number(match[1]),
    );
    expect(offsets).toEqual([
      content.indexOf("# 한글"),
      content.indexOf("## **같은"),
      content.indexOf("같은 제목\r\n---"),
    ]);
    expect(html).not.toMatch(/<h2[^>]*>가짜 제목/);
  },
);

it.each(["", "\uFEFF"])(
  "uses the preview parser and raw offsets for the live outline with prefix %j",
  (prefix) => {
    const content =
      prefix +
      "# 한글 😀\r\n\r\n## **중복** [링크](https://example.com) ![사진](https://example.com/pixel)\r\n\r\n" +
      "```md\r\n# 가짜\r\n```\r\n\r\n> 중복\r\n> ----\r\n";
    const outline = renderToStaticMarkup(
      createElement(DocumentOutline, {
        content,
        disabled: false,
        onJump: () => {},
      }),
    );
    const preview = renderToStaticMarkup(
      createElement(Preview, {
        content,
        onOpen: () => {},
      }),
    );
    const offsets = (html: string) =>
      [...html.matchAll(/data-heading-offset="(\d+)"/g)].map(
        (match) => match[1],
      );
    expect(offsets(outline)).toEqual(offsets(preview));
    expect(offsets(outline)).toHaveLength(3);
    expect(outline).toContain("한글 😀");
    expect(outline).toContain("사진");
    expect(outline).not.toMatch(/가짜|<a|<img|href=|src=/);
  },
);

it("disables outline navigation while its deferred snapshot is behind the editor", () => {
  const html = renderToStaticMarkup(
    createElement(DocumentOutline, {
      content: "# 제목",
      disabled: true,
      onJump: () => {},
    }),
  );
  expect(html).toMatch(/<button[^>]*disabled=""/);
});

it("excludes generated footnote headings without source positions from the outline", () => {
  const html = renderToStaticMarkup(
    createElement(DocumentOutline, {
      content: "# 제목\n\n각주[^1].\n\n[^1]: 각주 내용.\n",
      disabled: false,
      onJump: () => {},
    }),
  );
  expect(html).toContain("제목");
  expect(html.match(/<button/g)).toHaveLength(1);
  expect(html).not.toMatch(/Footnotes|NaN/);
});
