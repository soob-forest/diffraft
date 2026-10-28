import type { ErrorCode } from "../generated/ErrorCode";

const LABELS: Record<ErrorCode, string> = {
  INVALID_INPUT: "요청 범위와 입력 조건을 확인해 주세요.",
  SCHEMA_UNSUPPORTED: "앱 버전을 확인해 주세요.",
  AUTH_REQUIRED: "AI 연결 설정에서 공식 CLI 로그인을 확인해 주세요.",
  CLI_UNSUPPORTED: "AI 연결 설정에서 지원하는 CLI 버전을 확인해 주세요.",
  NETWORK_ERROR: "네트워크 연결을 확인한 뒤 다시 요청해 주세요.",
  RATE_OR_POLICY: "계정 사용 한도 또는 이용 정책을 확인해 주세요.",
  OUTPUT_INVALID: "응답 형식을 검증하지 못해 결과를 등록하지 않았습니다.",
  STALE_BASE:
    "원문이나 제안이 변경되었습니다. 최신 상태에서 새 요청을 작성해 주세요.",
  FILE_CONFLICT: "파일 비교·복구에서 외부 변경을 먼저 해결해 주세요.",
  SAVE_FAILED: "저장 공간과 권한을 확인해 주세요.",
  SESSION_MISSING:
    "이전 AI 연결을 찾지 못했습니다. 재시도하면 저장한 맥락으로 새 대화를 시작합니다.",
  CONTEXT_TOO_LARGE: "범위를 줄이거나 새 작업으로 대화를 나누어 주세요.",
  BUSY: "진행 중인 요청을 완료하거나 중단해 주세요.",
  CANCELLED: "요청을 중단했습니다.",
  UNKNOWN_ERROR: "요청을 완료하지 못했습니다. 연결 상태를 확인해 주세요.",
};
export function failureLabel(code: ErrorCode | null) {
  return LABELS[code ?? "UNKNOWN_ERROR"];
}
