import { describe, expect, it } from "vitest";
import { quotePreviewOffset } from "../src/review/quote-context";

describe("긴 인용의 변경 위치 우선 표시", () => {
  const before = [
    "| 항목 | 수치 |",
    "| --- | --- |",
    ...Array.from({ length: 40 }, (_, i) => `| 명령${i} 😀 | ${i} |`),
  ].join("\n");
  it("표 끝 추가는 주변 문맥부터 표시하고 전체 문자열을 보존한다", () => {
    const after = `${before}\n| 새 명령 | 40 |`;
    const offset = quotePreviewOffset(after, before, after);
    expect(after.slice(offset)).toBe("| 명령39 😀 | 39 |\n| 새 명령 | 40 |");
  });
  it("삭제된 표 끝도 남은 마지막 문맥을 우선한다", () => {
    const after = before.split("\n").slice(0, -1).join("\n");
    expect(before.slice(quotePreviewOffset(before, before, after))).toContain(
      "| 명령38 😀 | 38 |",
    );
  });
  it("명시적으로 선택한 일부 인용과 한 줄 변경은 처음부터 표시한다", () => {
    expect(quotePreviewOffset("선택 구간", before, `${before}\n추가`)).toBe(0);
    expect(quotePreviewOffset("수정 문장", "원문 문장", "수정 문장")).toBe(0);
  });
  it("같은 내용에는 표시 이동이 없다", () =>
    expect(quotePreviewOffset(before, before, before)).toBe(0));
});
