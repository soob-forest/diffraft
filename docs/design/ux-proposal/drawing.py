"""Editable SVG primitives for the DocReview proposal screens."""

from html import escape
from pathlib import Path

WIDTH, HEIGHT = 1440, 900
INK, MUTED, LINE = "#182537", "#526276", "#dce4ee"
BLUE, SOFT, PANEL = "#2957c8", "#eaf0ff", "#f8fafc"
GREEN, RED, AMBER = "#e8f5ec", "#fdecec", "#fff3d9"


class Screen:
    def __init__(self, title):
        self.parts = [
            f'<svg xmlns="http://www.w3.org/2000/svg" width="{WIDTH}" height="{HEIGHT}" viewBox="0 0 {WIDTH} {HEIGHT}" role="img" aria-labelledby="title desc">',
            f'<title id="title">{escape(title)}</title>',
            '<desc id="desc">DocReview 개선 제안 화면. 합성 예시이며 실제 앱 캡처가 아닙니다.</desc>',
            '<style>text{font-family:"Apple SD Gothic Neo","Noto Sans CJK KR",sans-serif;font-size:16px;fill:#182537} .small{font-size:13px;fill:#526276}.muted{fill:#526276}.title{font-size:22px;font-weight:600}.heading{font-size:16px;font-weight:600}.blue{fill:#2957c8}.green{fill:#14633b}.red{fill:#a0332d}.white{fill:white}.mono{font-family:"SFMono-Regular",Menlo,"Apple SD Gothic Neo",monospace}</style>',
        ]

    def rect(self, box, fill, stroke=None, radius=0):
        x, y, width, height = box
        border = f' stroke="{stroke}"' if stroke else ""
        self.parts.append(f'<rect x="{x}" y="{y}" width="{width}" height="{height}" rx="{radius}" fill="{fill}"{border}/>')

    def text(self, point, value, style=""):
        x, y = point
        self.parts.append(f'<text x="{x}" y="{y}" class="{style}">{escape(value)}</text>')

    def lines(self, point, values, style="", gap=27):
        for index, value in enumerate(values):
            self.text((point[0], point[1] + index * gap), value, style)

    def button(self, box, label, kind="secondary"):
        fill, border, style = {
            "primary": (BLUE, None, "white"),
            "secondary": ("white", "#c2cfe1", ""),
            "soft": (SOFT, None, "blue"),
        }[kind]
        self.rect(box, fill, border, 6)
        x, y, width, height = box
        self.parts.append(f'<text x="{x + width / 2}" y="{y + height / 2 + 6}" text-anchor="middle" class="{style}">{escape(label)}</text>')

    def divider(self, point, width):
        self.rect((*point, width, 1), LINE)

    def callout(self, box, values, tone="neutral"):
        fill = {"neutral": "#edf2f6", "blue": SOFT, "amber": AMBER, "green": GREEN}[tone]
        self.rect(box, fill, None, 6)
        self.lines((box[0] + 16, box[1] + 27), values, "small", 23)

    def save(self, path):
        Path(path).write_text("\n".join([*self.parts, "</svg>"]) + "\n", encoding="utf-8")


def shell(title, mode="review", version=12):
    screen = Screen(title)
    screen.rect((0, 0, WIDTH, HEIGHT), "white")
    screen.rect((0, 0, WIDTH, 50), INK)
    screen.rect((20, 11, 28, 28), "#8eafff", None, 7)
    screen.text((27, 32), "D", "heading")
    screen.text((62, 32), "DocReview", "white heading")
    screen.text((169, 32), "내 작업 공간", "white small")
    screen.rect((0, 50, 196, 820), "#edf2f6")
    screen.text((20, 92), "문서", "small")
    screen.lines((24, 143), ["문서 열기", "새 문서", "AI 연결 설정"], gap=54)
    screen.rect((12, 326, 172, 44), SOFT, None, 6)
    screen.text((24, 354), "여행 준비 가이드", "blue")
    screen.text((24, 420), "▸ 문서 탐색", "small")
    screen.rect((1080, 50, 360, 820), PANEL)
    screen.rect((1080, 50, 1, 820), LINE)
    screen.text((220, 98), "여행 준비 가이드", "title")
    screen.text((420, 98), f"v{version}", "small")
    screen.text((456, 98), "원문 저장됨", "small green")
    screen.button((760, 73, 126, 40), "파일 비교·복구")
    screen.button((900, 73, 156, 40), "확정본 내보내기")
    tabs = [(220, "원문", "source"), (280, "변경 검토", "review"), (378, "미리보기", "preview")]
    for x, label, key in tabs:
        screen.text((x, 154), label, "blue" if key == mode else "muted")
        if key == mode:
            screen.rect((x, 177, 62 if key == "review" else 36, 3), BLUE)
    screen.text((966, 154), "패널 접기", "small")
    screen.divider((196, 180), 884)
    screen.divider((196, 836), 884)
    screen.text((220, 858), f"버전 기록 · {version}개", "small")
    screen.rect((0, 870, 1440, 30), "#e7edf4")
    screen.text((20, 891), "로컬 작업 공간 · 승인한 변경만 확정본에 반영됩니다.", "small")
    return screen


def review_tools(screen, label="변경 검토 · 남은 3개"):
    screen.text((220, 216), label, "heading")
    screen.text((760, 216), "제안 기록", "small")
    screen.button((884, 191, 172, 38), "남은 제안 전체 승인")
    screen.text((220, 264), "선택 1 / 3 · 출발 준비", "heading")
    screen.button((614, 240, 78, 36), "이전")
    screen.button((700, 240, 78, 36), "다음")
    screen.button((786, 240, 98, 36), "변경 거절")
    screen.button((894, 240, 162, 36), "변경 그룹 승인", "primary")
    screen.rect((196, 293, 884, 48), "#f5f7fa")
    screen.text((220, 324), "인라인     나란히       □ 전체 문맥     □ 공백 표시", "small")
    screen.text((870, 324), "− 삭제 · + 추가", "small")


def diff_body(screen, selected=False, revised=False):
    screen.text((244, 377), "1. 출발 준비", "heading blue")
    screen.rect((196, 395, 884, 43), RED)
    screen.text((218, 423), "4  −", "small red")
    screen.text((274, 423), "준비를 마치면 동행인에게 알립니다.", "red")
    screen.rect((196, 438, 884, 43), GREEN)
    screen.text((218, 466), "4  +", "small green")
    if selected:
        screen.rect((269, 444, 495, 31), "#d4e1ff", "#8ba9ed", 3)
    value = "준비를 확인한 뒤 동행인에게 알립니다." if revised else "준비 확인이 끝나면 동행인에게 바로 알립니다."
    screen.text((274, 466), value, "green")
    screen.text((274, 512), "출발 시간과 이동 경로를 함께 기록합니다.")
    screen.text((244, 576), "2. 확인 시간", "heading")
    screen.rect((196, 594, 884, 43), RED)
    screen.text((218, 622), "8  −", "small red")
    screen.text((274, 622), "출발 전 10분 동안 준비물을 확인합니다.", "red")
    screen.rect((196, 637, 884, 43), GREEN)
    screen.text((218, 665), "8  +", "small green")
    screen.text((274, 665), "출발 전 5분 동안 준비물을 확인합니다.", "green")
    screen.text((244, 733), "3. 여행 기록", "heading")
    screen.rect((196, 748, 884, 36), RED)
    screen.text((218, 773), "12 −", "small red")
    screen.text((274, 773), "필요하면 다음 준비 사항을 정리합니다.", "red")
    screen.rect((196, 784, 884, 36), GREEN)
    screen.text((218, 809), "12 +", "small green")
    screen.text((274, 809), "다음 준비 사항이 있으면 정리합니다.", "green")


def quote(screen, y=170):
    screen.callout((1104, y, 312, 111), ["준비 확인이 끝나면 동행인에게", "바로 알립니다."], "blue")


def request_header(screen):
    screen.text((1104, 92), "선택한 부분 수정", "heading")
    screen.text((1104, 124), "출발 준비 · 제안 내용 r1", "small")
    screen.text((1104, 151), "선택한 1문장 · 대상 고정", "small blue")
    quote(screen)
