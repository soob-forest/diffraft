// Same UTF-8 boundary as native generation and comment contracts.
export const MAX_DRAFT_BYTES = 16 * 1024;
export function draftError(value: string) {
  if (!value.trim()) return "내용을 입력해 주세요.";
  if (value.includes("\0")) return "입력에 사용할 수 없는 문자가 있습니다.";
  if (new TextEncoder().encode(value).length > MAX_DRAFT_BYTES)
    return "내용은 16 KiB 이내로 입력해 주세요. 작성한 내용은 그대로 보관됩니다.";
  return "";
}
