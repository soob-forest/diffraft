"""Generate proposal SVGs and exact-aspect PNGs using macOS rendering."""

from pathlib import Path
import subprocess
import sys
import tempfile
import xml.etree.ElementTree as ET

sys.dont_write_bytecode = True
from drawing import HEIGHT, WIDTH
from screens import SCENES

ROOT = Path(__file__).resolve().parent
PIXEL_WIDTH, PIXEL_HEIGHT = WIDTH * 2, HEIGHT * 2
NS = {"svg": "http://www.w3.org/2000/svg"}


def validate_svg(path):
    root = ET.parse(path).getroot()
    if root.get("viewBox") != "0 0 1440 900":
        raise ValueError(f"Unexpected canvas: {path.name}")
    if not root.find("svg:title", NS).text:
        raise ValueError(f"Missing accessible title: {path.name}")
    for element in root.findall("svg:text", NS):
        x, y = float(element.get("x")), float(element.get("y"))
        if not 0 <= x < 1440 or not 0 < y < 900:
            raise ValueError(f"Text outside canvas: {path.name}")


def render_png(svg, staging, cropper):
    # Quick Look sizes SVG thumbnails to a square. Pad the rendering input,
    # then remove only that padding; keep the editable SVG at 1440 x 900.
    root = ET.parse(svg).getroot()
    root.set("height", str(WIDTH))
    root.set("viewBox", f"0 0 {WIDTH} {WIDTH}")
    ET.register_namespace("", NS["svg"])
    padded = Path(staging) / svg.name
    ET.ElementTree(root).write(padded, encoding="utf-8", xml_declaration=True)
    subprocess.run(
        ["/usr/bin/qlmanage", "-t", "-s", str(PIXEL_WIDTH), "-o", staging, str(padded)],
        check=True, capture_output=True, text=True,
    )
    rendered = Path(staging) / f"{svg.name}.png"
    if not rendered.exists():
        raise FileNotFoundError(f"PNG rendering failed: {svg.stem}")
    subprocess.run(
        [str(cropper), str(rendered), str(svg.with_suffix(".png")),
         str(PIXEL_WIDTH), str(PIXEL_HEIGHT)],
        check=True, capture_output=True, text=True,
    )


def build():
    with tempfile.TemporaryDirectory(prefix="diffraft-ux-screens-") as staging:
        cropper = Path(staging) / "crop-png"
        subprocess.run(
            ["/usr/bin/swiftc", str(ROOT / "crop-png.swift"), "-o", str(cropper)],
            check=True, capture_output=True, text=True,
        )
        for slug, title, make_screen in SCENES:
            svg = ROOT / f"{slug}.svg"
            make_screen().save(svg)
            validate_svg(svg)
            render_png(svg, staging, cropper)
            print(f"Rendered {slug}: {title}")


if __name__ == "__main__":
    build()
