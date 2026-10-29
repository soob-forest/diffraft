import { expect, it } from "vitest";
import { compactReviewRows, type ReviewRow } from "../src/review/rows";

const line = (key: string, raw: string, from: number, kind = "equal") =>
  ({
    key,
    raw,
    beforeFrom: from,
    afterFrom: from,
    kind,
    folded: 0,
  }) as ReviewRow;

it("omits repeated Markdown headings and their separators from compact review", () => {
  const rows = [
    line("title", "# 문서\n", 0),
    line("gap", "\n", 5),
    line("heading", "## 변경\n", 6),
    line("deleted", "이전 문장\n", 12, "delete"),
    line("inserted", "새 문장\n", 12, "insert"),
    line("context", "보존 문장\n", 20),
  ];
  expect(compactReviewRows(rows, [0, 6]).map((row) => row.key)).toEqual([
    "deleted",
    "inserted",
    "context",
  ]);
  expect(rows).toHaveLength(6);
});

it("preserves code comments, blank code lines, and explicit folded context", () => {
  const rows = [
    line("code", "# 코드 주석\n", 8),
    line("blank-code", "\n", 18),
    { ...line("fold", "", 19), kind: "fold", folded: 20 } as ReviewRow,
  ];
  expect(compactReviewRows(rows, [])).toEqual(rows);
});
