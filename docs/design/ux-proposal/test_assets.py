"""Contract checks for the document images, gallery links, and SVG input."""

from html.parser import HTMLParser
from pathlib import Path
import re
import struct
import tempfile
import unittest
from urllib.parse import unquote, urlsplit

from build import ROOT, validate_svg
from screens import SCENES


class GalleryLinks(HTMLParser):
    def __init__(self):
        super().__init__()
        self.targets = []
        self.ids = set()

    def handle_starttag(self, tag, attributes):
        values = dict(attributes)
        if "id" in values:
            self.ids.add(values["id"])
        for name in ("src", "href"):
            if name in values:
                self.targets.append(values[name])


class ProposalAssetsTest(unittest.TestCase):
    def test_every_screen_has_a_complete_png_and_editable_svg(self):
        for slug, _, _ in SCENES:
            with self.subTest(screen=slug):
                validate_svg(ROOT / f"{slug}.svg")
                data = (ROOT / f"{slug}.png").read_bytes()
                self.assertEqual(data[:8], b"\x89PNG\r\n\x1a\n")
                self.assertEqual(struct.unpack(">II", data[16:24]), (2880, 1800))

    def test_gallery_navigation_and_asset_links_resolve(self):
        links = GalleryLinks()
        links.feed((ROOT / "index.html").read_text(encoding="utf-8"))
        for target in links.targets:
            with self.subTest(link=target):
                parts = urlsplit(target)
                if parts.scheme:
                    continue
                if parts.path:
                    self.assertTrue((ROOT / unquote(parts.path)).exists())
                elif parts.fragment:
                    self.assertIn(parts.fragment, links.ids)

    def test_proposal_embeds_every_screen(self):
        document = (ROOT.parent / "ux-improvement-proposal.md").read_text(encoding="utf-8")
        images = re.findall(r'!\[[^\]]*\]\(ux-proposal/([^)]*)\)', document)
        self.assertEqual(set(images), {f"{slug}.png" for slug, _, _ in SCENES})

    def test_rejects_unexpected_canvas_and_text_outside_canvas(self):
        invalid = [
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 900"><title>test</title></svg>',
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1440 900"><title>test</title><text x="1441" y="10">outside</text></svg>',
        ]
        with tempfile.TemporaryDirectory(prefix="diffraft-ux-validation-") as folder:
            path = Path(folder) / "invalid.svg"
            for content in invalid:
                path.write_text(content, encoding="utf-8")
                with self.assertRaises(ValueError):
                    validate_svg(path)


if __name__ == "__main__":
    unittest.main()
