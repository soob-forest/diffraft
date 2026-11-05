import { removeNativeKeyTrace } from "./support/unit-review-key-events.mjs";
import {
  assertApprovalAutorepeatBlocked,
  assertFreshDecisionFocus,
  assertLastDecisionCompletion,
} from "./support/unit-review-keyboard-decisions.mjs";
import {
  keyboardDocuments,
  prepareKeyboardReview,
  recordKeyboardEvidence,
} from "./support/unit-review-keyboard-fixture.mjs";
import {
  assertEmptyFilterNativeKeys,
  assertNativeCommentKeys,
  assertPendingNativeCycle,
  assertProcessedNativeCycle,
  assertSyntheticCompositionEscape,
} from "./support/unit-review-keyboard-navigation.mjs";

let fixture;
let documentIndex = 0;
describe("변경별 검토의 macOS 키보드 경계 · 실제 IME/VoiceOver는 별도 미검증", () => {
  beforeEach(async () => {
    fixture = null;
    fixture = await prepareKeyboardReview(keyboardDocuments[documentIndex++]);
  });
  afterEach(async function () {
    try {
      await recordKeyboardEvidence(
        fixture,
        this.currentTest.state,
        this.currentTest.title,
      );
    } finally {
      await removeNativeKeyTrace();
    }
  });

  it("실제 Tab·Enter 줄바꿈·Esc 복귀가 입력과 원문을 보존한다", async () => {
    await assertNativeCommentKeys(fixture);
  });
  it("합성 composing Escape 가드만 검사한다 · 실제 한글 IME 검사 아님", async () => {
    await assertSyntheticCompositionEscape(fixture);
  });
  it("실제 F7/Shift+F7은 미처리 필터 안에서만 순환한다", async () => {
    await assertPendingNativeCycle(fixture);
  });
  it("실제 F7/Shift+F7은 처리됨 필터의 한 항목을 유지한다", async () => {
    await assertProcessedNativeCycle(fixture);
  });
  it("빈 필터의 실제 탐색·Enter/Space는 아무 단위도 결정하지 않는다", async () => {
    await assertEmptyFilterNativeKeys(fixture);
  });
  it("승인 버튼 포커스의 OS autorepeat Enter/Space는 0건 처리한다", async () => {
    await assertApprovalAutorepeatBlocked(fixture);
  });
  it("fresh Enter는 1건만 승인하고 제목 포커스의 추가 키는 0건 처리한다", async () => {
    await assertFreshDecisionFocus(fixture);
  });
  it("마지막 결정은 완료에 포커스하고 추가 키로 원문을 다시 바꾸지 않는다", async () => {
    await assertLastDecisionCompletion(fixture);
  });
});
