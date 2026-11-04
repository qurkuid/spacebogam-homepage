import json
import tempfile
import time
import unittest
from pathlib import Path

from PIL import Image

from scripts.prepare_gallery_photos import build_preview, generate


class GalleryPreviewsTest(unittest.TestCase):
    def test_builds_responsive_variants_without_upscaling_or_touching_sources(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            assets = root / "assets/photos"
            assets.mkdir(parents=True)
            landscape = assets / "landscape.jpg"
            portrait = assets / "portrait.jpg"
            Image.new("RGB", (900, 600), "red").save(landscape, quality=90)
            Image.new("RGB", (240, 480), "blue").save(portrait, quality=90)
            source_bytes = {path: path.read_bytes() for path in (landscape, portrait)}
            output = root / "assets/gallery-previews"
            output.mkdir(parents=True)

            wide = build_preview(landscape, output)
            narrow = build_preview(portrait, output)

            self.assertEqual([int(item.rsplit(" ", 1)[1][:-1]) for item in wide["srcset"].split(", ")], [360, 720, 900])
            self.assertEqual((wide["width"], wide["height"]), (720, 480))
            self.assertEqual([int(item.rsplit(" ", 1)[1][:-1]) for item in narrow["srcset"].split(", ")], [240])
            self.assertEqual((narrow["width"], narrow["height"]), (240, 480))
            self.assertEqual({path: path.read_bytes() for path in source_bytes}, source_bytes)
            mtimes = {path: path.stat().st_mtime_ns for path in output.iterdir()}
            time.sleep(0.01)
            self.assertEqual(build_preview(landscape, output), wide)
            self.assertEqual({path: path.stat().st_mtime_ns for path in output.iterdir()}, mtimes)

    def test_discovers_gallery_and_before_after_originals_deterministically(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "assets/photos").mkdir(parents=True)
            for name, color in (("gallery.jpg", "red"), ("before.jpg", "blue")):
                Image.new("RGB", (400, 300), color).save(root / "assets/photos" / name)
            (root / "portfolio.html").write_text(
                '<section class="v8-grid"><article><a data-project="p" href="case.html"></a></article></section>', encoding="utf-8"
            )
            (root / "case.html").write_text(
                '<a data-gallery-image href="/assets/photos/gallery.jpg"><img></a>'
                '<section id="before-after"><a href="/assets/photos/before.jpg"><img></a></section>', encoding="utf-8"
            )

            first = generate(root)
            manifest = (root / "data/cases/gallery-previews.json").read_bytes()
            second = generate(root)

            self.assertEqual(first, second)
            self.assertEqual(json.loads(manifest), first)
            self.assertEqual((root / "data/cases/gallery-previews.json").read_bytes(), manifest)
            self.assertEqual(set(first), {"/assets/photos/before.jpg", "/assets/photos/gallery.jpg"})

    def test_applies_exif_orientation_before_resizing(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / "rotated.jpg"
            output = root / "previews"
            output.mkdir()
            exif = Image.Exif()
            exif[274] = 6
            Image.new("RGB", (300, 600), "green").save(source, exif=exif)

            preview = build_preview(source, output)

            self.assertEqual((preview["width"], preview["height"]), (600, 300))


if __name__ == "__main__":
    unittest.main()
