"""Proposal states using the current desktop app's visual language."""

from drawing import AMBER, BLUE, GREEN, MUTED, PANEL, SOFT
from drawing import diff_body, quote, request_header, review_tools, shell


def selection_request():
    screen = shell("선택한 부분에서 수정 요청 시작")
    review_tools(screen)
    diff_body(screen, selected=True)
    screen.rect((748, 489, 308, 46), "white", "#b8c9e5", 8)
    screen.button((754, 494, 159, 36), "이 부분 수정", "primary")
    screen.button((921, 494, 128, 36), "코멘트")
    request_header(screen)
    screen.lines((1104, 316), ["수정 범위: 선택한 1문장", "참고 문맥: 이 변경의 문단"], "small", 25)
    screen.text((1104, 381), "수정 지시", "heading")
    screen.rect((1104, 397, 312, 112), "white", "#8ba9ed", 6)
    screen.lines((1120, 427), ["뜻은 유지하고", "더 간결하게 다듬어 주세요."])
    screen.button((1104, 522, 92, 32), "간결하게", "soft")
    screen.button((1204, 522, 92, 32), "더 쉽게", "soft")
    screen.text((1104, 584), "미전송 초안", "small")
    screen.callout((1104, 600, 312, 74), ["선택 밖 후보 문구는 유지합니다.", "원문 반영은 별도 승인이 필요합니다."])
    screen.button((1104, 697, 312, 44), "요청 내용 확인", "primary")
    screen.text((1104, 776), "대상 변경    ·    변경 상세로 돌아가기", "small")
    return screen


def request_confirm():
    screen = shell("수정 대상과 전달 범위를 확인")
    review_tools(screen)
    diff_body(screen, selected=True)
    request_header(screen)
    screen.text((1104, 316), "요청 내용 확인", "heading")
    screen.lines((1104, 350), ["뜻은 유지하고 더 간결하게", "다듬어 주세요."])
    screen.divider((1104, 399), 312)
    screen.lines((1104, 432), ["수정할 범위  선택한 1문장", "전달할 문맥  현재 변경의 문단", "저장된 코멘트  포함 안 함"], "small", 31)
    screen.text((1104, 554), "Codex · gpt-5.1 · medium", "heading")
    screen.lines((1104, 587), ["사용 한도를 소비할 수 있습니다.", "기존 후보는 새 결과 저장까지 유지합니다."], "small", 25)
    screen.callout((1104, 640, 312, 74), ["이 선택 밖 후보 문구는 유지합니다.", "다른 변경 2개는 그대로 남습니다."], "green")
    screen.button((1104, 738, 95, 44), "수정하기")
    screen.button((1211, 738, 205, 44), "확인 후 요청", "primary")
    return screen


def revised_candidate():
    screen = shell("새 후보를 같은 위치에서 검토")
    review_tools(screen)
    diff_body(screen, revised=True)
    screen.text((1104, 92), "선택한 부분 수정 완료", "heading")
    screen.text((1104, 124), "새 후보 r2 · 미승인", "small green")
    screen.callout((1104, 155, 312, 106), ["준비를 확인한 뒤", "동행인에게 알립니다."], "green")
    screen.lines((1104, 301), ["✓ 선택 밖 후보 문구 유지", "✓ 다른 변경 2개 유지", "✓ 원문 v12 유지"], "small", 32)
    screen.button((1104, 415, 312, 42), "이전 후보 r1과 비교")
    screen.button((1104, 470, 312, 42), "다시 다듬기")
    screen.divider((1104, 546), 312)
    screen.text((1104, 582), "원문에 반영하려면", "heading")
    screen.lines((1104, 616), ["문장 수정과 승인 단위는 다릅니다.", "연결된 변경 그룹 전체를 검토한 뒤", "승인해 주세요."], "small", 25)
    screen.button((1104, 712, 312, 44), "선택한 변경 그룹 승인", "primary")
    screen.text((1104, 796), "이 요청의 작업 기록 보기 →", "small blue")
    return screen


def source_lines(screen, start=250, selected=False):
    rows = ["# 여행 준비 가이드", "", "## 출발 준비", "준비를 마치면 동행인에게 알립니다.", "출발 시간과 이동 경로를 함께 기록합니다.", "", "## 확인 시간", "출발 전 10분 동안 준비물을 확인합니다.", "준비가 늦어지면 진행 상황을 공유합니다.", "", "## 여행 기록", "필요하면 다음 준비 사항을 정리합니다."]
    if selected:
        screen.rect((265, start + 68, 570, 61), "#d4e1ff", "#8ba9ed", 3)
    for index, value in enumerate(rows):
        screen.text((222, start + index * 28), str(index + 1), "small")
        screen.text((274, start + index * 28), value)


def task_header(screen, mode="부분 수정"):
    screen.text((1104, 92), "현재 작업", "heading")
    screen.rect((1104, 112, 312, 52), "white", "#b8c5d5", 6)
    screen.text((1120, 145), "사실과 수치 유지")
    screen.text((1104, 207), "작업 목표·조건", "heading")
    screen.text((1104, 238), "수치 유지 · 한국어로 간결하게", "small")
    screen.text((1104, 268), "조건 편집", "small")
    screen.text((1104, 320), "AI 요청", "heading")
    screen.button((1104, 339, 92, 36), mode, "soft")
    screen.button((1204, 339, 82, 36), "설명")
    screen.button((1294, 339, 122, 36), "전체 재작성")


def source_scope():
    screen = shell("원문에서 선택한 범위로 요청", "source")
    source_lines(screen, selected=True)
    screen.rect((710, 392, 341, 46), "white", "#b8c9e5", 8)
    screen.button((716, 397, 215, 36), "선택한 영역에 요청", "primary")
    screen.button((939, 397, 105, 36), "복사")
    task_header(screen)
    screen.callout((1104, 395, 312, 98), ["요청 범위 · 선택한 1문단", "출발 준비 · 원문 v12", "대상 변경"], "blue")
    screen.text((1104, 530), "이번 요청", "heading")
    screen.rect((1104, 549, 312, 89), "white", "#a5b4c6", 6)
    screen.text((1120, 581), "이 문단을 더 쉽게 설명해 주세요.")
    screen.lines((1104, 670), ["새 제안 저장 시 기존 미승인 제안은", "기록으로 옮깁니다. 요청 전에 확인합니다."], "small", 24)
    screen.button((1104, 750, 312, 44), "요청 내용 확인", "primary")
    return screen


def source_impact():
    screen = shell("원문을 편집하기 전에 영향 안내", "source")
    screen.callout((220, 204, 836, 119), ["원문을 수정하면 남은 제안 3개는 최신 문서 기준으로 다시 요청해야 합니다.", "제안 문구만 바꾸려면 후보에서 수정하세요."], "amber")
    screen.button((803, 274, 229, 35), "변경 검토로 이동")
    source_lines(screen, start=372)
    task_header(screen)
    screen.callout((1104, 399, 312, 105), ["검토할 변경 3개가 남아 있습니다.", "아직 원문에 반영하지 않았습니다."], "blue")
    screen.button((1104, 529, 312, 44), "검토 이어가기", "primary")
    screen.divider((1104, 609), 312)
    screen.text((1104, 646), "원문은 계속 편집할 수 있습니다.", "heading")
    screen.lines((1104, 682), ["후보에서는 원문을 유지한 채", "선택한 표현만 다시 다듬을 수 있습니다."], "small", 25)
    return screen


def proposal_history():
    screen = shell("이전 제안은 중앙에서 읽기 전용 비교")
    screen.text((220, 217), "이전 제안 열람 · 읽기 전용", "heading")
    screen.callout((220, 237, 836, 79), ["이 제안은 새 요청으로 교체되었습니다.", "아래 내용은 당시 원문 v12와 후보 r1의 비교입니다."])
    diff_body(screen)
    screen.text((1104, 92), "제안 기록", "heading")
    records = [(139, "현재 제안", "미검토 변경 3개", False), (245, "이전 제안 · 표현 다듬기", "새 요청으로 교체됨 · 선택됨", True), (351, "이전 제안 · 초안 작성", "전체 승인됨", False)]
    for y, title, status, active in records:
        screen.rect((1104, y, 312, 88), SOFT if active else "white", "#c2cfe1", 6)
        screen.text((1120, y + 32), title, "heading")
        screen.text((1120, y + 61), status, "small blue" if active else "small")
    screen.button((1104, 479, 312, 44), "현재 제안 검토로 돌아가기", "primary")
    screen.button((1104, 535, 312, 42), "현재 확정본 보기")
    screen.text((1104, 620), "과거 기록에서 승인하지 않습니다.", "small")
    return screen


def completed_review():
    screen = shell("검토 완료 상태와 다음 행동", version=14)
    screen.text((220, 219), "검토 완료", "heading green")
    screen.text((220, 259), "변경 3개 중 승인 2개 · 거절 1개", "muted")
    screen.callout((220, 287, 836, 72), ["승인한 변경을 확정본 v14에 저장했습니다.", "거절한 변경은 반영하지 않았습니다."], "green")
    screen.button((220, 382, 170, 44), "확정본 보기", "primary")
    screen.button((402, 382, 180, 44), "확정본 내보내기")
    screen.button((594, 382, 180, 44), "처리한 변경 보기")
    screen.text((220, 499), "확정본 미리보기 · v14", "heading")
    screen.lines((244, 553), ["출발 준비", "준비를 확인한 뒤 동행인에게 알립니다.", "출발 시간과 이동 경로를 함께 기록합니다.", "", "확인 시간", "출발 전 10분 동안 준비물을 확인합니다."], gap=37)
    screen.text((1104, 92), "작업 대화", "heading")
    screen.text((1104, 145), "AI · 표현을 다듬은 제안", "heading")
    screen.lines((1104, 179), ["문장 표현을 더 명확하게 바꿨습니다.", "수치 변경은 별도로 확인해 주세요."], "small", 25)
    screen.callout((1104, 247, 312, 82), ["현재 상태 · 검토 완료", "승인 2개 · 거절 1개"], "green")
    screen.button((1104, 350, 312, 42), "이 요청의 변경 보기")
    screen.button((1104, 407, 312, 42), "새 요청 작성", "primary")
    screen.lines((1104, 507), ["이전 요청을 바탕으로 계속 다듬거나", "새 요청을 작성할 수 있습니다."], "small", 25)
    return screen


def request_types():
    screen = shell("요청 종류와 사용할 AI를 한곳에서 확인", "source")
    source_lines(screen)
    task_header(screen, "부분 수정")
    screen.callout((1104, 397, 312, 72), ["요청 범위 · 현재 섹션", "출발 준비 · 원문 v12"])
    screen.text((1104, 508), "Codex · 기본값", "heading")
    screen.text((1325, 508), "변경", "small blue")
    screen.text((1104, 536), "요청 확인 시 실제 모델을 결정합니다.", "small")
    screen.text((1104, 580), "이번 요청", "heading")
    screen.rect((1104, 598, 312, 100), "white", "#a5b4c6", 6)
    screen.lines((1120, 629), ["수치는 유지하고", "읽기 쉽게 다듬어 주세요."])
    screen.text((1104, 726), "초안 · 이 작업에 저장됨", "small green")
    screen.button((1104, 746, 312, 44), "요청 내용 확인", "primary")
    screen.text((1104, 823), "▸ 작업 대화 · 이전 결과 보기", "small")
    return screen


def invalid_selection():
    screen = shell("삭제와 추가를 섞어 선택했을 때의 안내")
    review_tools(screen)
    diff_body(screen)
    screen.rect((268, 401, 516, 74), "#d4e1ff", "#8ba9ed", 3)
    screen.text((274, 423), "준비를 마치면 동행인에게 알립니다.")
    screen.text((274, 466), "준비 확인이 끝나면 동행인에게 바로 알립니다.")
    screen.text((1104, 92), "수정할 범위를 확인해 주세요", "heading")
    screen.callout((1104, 124, 312, 126), ["변경 전과 제안 내용이", "함께 선택되어 있습니다.", "한쪽에서 연속된 범위를 선택해 주세요."], "amber")
    screen.text((1104, 293), "어느 내용을 다듬을까요?", "heading")
    screen.lines((1104, 331), ["제안 문구를 고치려면 초록색 추가 행에서", "다시 선택하세요."], "small", 25)
    screen.button((1104, 405, 312, 44), "제안 내용에서 다시 선택", "primary")
    screen.button((1104, 463, 312, 44), "이 변경 전체 다시 제안")
    screen.divider((1104, 548), 312)
    screen.lines((1104, 586), ["작성하던 지시는 보관합니다.", "대상을 바꿔도 자동 요청하지 않습니다."], "small", 25)
    return screen


SCENES = [
    ("selection-request", "선택한 부분에서 바로 요청", selection_request),
    ("request-confirm", "수정 범위와 전달 문맥 확인", request_confirm),
    ("revised-candidate", "새 후보를 같은 위치에서 검토", revised_candidate),
    ("invalid-selection", "혼합 선택의 재선택 안내", invalid_selection),
    ("source-scope", "원문 선택과 요청 범위 연결", source_scope),
    ("source-impact", "원문 편집 영향 사전 안내", source_impact),
    ("proposal-history", "이전 제안의 읽기 전용 비교", proposal_history),
    ("completed-review", "검토 완료와 대화 결과 연결", completed_review),
    ("request-types", "요청 종류와 AI 설정 요약", request_types),
]
