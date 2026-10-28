export const shortText = "짧은 안내.";
export const longText =
  "여행 준비와 이동 계획을 확인하고 여행 기록에 남깁니다. "
    .repeat(16)
    .trimEnd();
export const originalCode = `const message = "${"긴 코드 내용 ".repeat(15)}";`;
export const revisedCode = 'const message = "확인 완료";';
export const layoutSource = [
  "# 긴 줄 검토",
  "",
  shortText,
  "",
  "| 조건 | 설명 |",
  "| --- | --- |",
  `| 확인 | ${"표의 긴 설명 ".repeat(12)} |`,
  "",
  "```javascript",
  originalCode,
  "```",
  "",
  "끝 기준",
  ...Array.from(
    { length: 30 },
    (_, index) => `\n문맥 ${index + 1}: 저장할 내용은 그대로 유지합니다.`,
  ),
].join("\n");
export const layoutResponse = {
  schema_version: 1,
  mode: "PATCH",
  summary: "긴 줄·표·코드 비교",
  changes: [
    { block_id: "b3", before: shortText, after: longText, reason: "안내 확장" },
    {
      block_id: "b9",
      before: originalCode,
      after: revisedCode,
      reason: "코드 축약",
    },
  ],
};
