"""Build responsive WebP previews for the public case galleries."""
from __future__ import annotations

import hashlib
import json
from pathlib import Path

from bs4 import BeautifulSoup
from PIL import Image, ImageOps

if __package__:
    from scripts.refresh_case_galleries import ROOT, asset_path
else:
    from refresh_case_galleries import ROOT, asset_path


WIDTHS = (360, 720, 1280)
QUALITY = 78
METHOD = 4
OUTPUT = Path("assets/gallery-previews")
MANIFEST = Path("data/cases/gallery-previews.json")


def gallery_sources(root: Path) -> list[str]:
    portfolio = BeautifulSoup((root / "portfolio.html").read_text(encoding="utf-8"), "html.parser")
    sources = set()
    for link in portfolio.select(".v8-grid a[data-project]"):
        page = (root / link["href"]).resolve()
        if root.resolve() not in page.parents:
            raise ValueError(f"Case page escapes the site root: {link['href']}")
        soup = BeautifulSoup(page.read_text(encoding="utf-8"), "html.parser")
        for image in soup.select("[data-gallery-image] img, #before-after img"):
            anchor = image.find_parent("a", href=True)
            if anchor:
                sources.add(asset_path(anchor["href"]))
    return sorted(sources)


def _mode(image: Image.Image) -> str:
    return "RGBA" if image.mode in ("RGBA", "LA") or "transparency" in image.info else "RGB"


def build_preview(source: Path, output_dir: Path) -> dict:
    source_bytes = source.read_bytes()
    with Image.open(source) as opened:
        image = ImageOps.exif_transpose(opened).convert(_mode(opened))
        original_width, original_height = image.size
        widths = sorted(set(min(width, original_width) for width in WIDTHS))
        variants = []
        for width in widths:
            height = round(original_height * width / original_width)
            signature = hashlib.sha256(
                source_bytes + f"gallery-preview-v1:{width}:{QUALITY}:{METHOD}".encode()
            ).hexdigest()[:16]
            filename = f"{signature}-{width}.webp"
            target = output_dir / filename
            if not target.exists():
                resized = image if width == original_width else image.resize((width, height), Image.Resampling.LANCZOS)
                resized.save(target, "WEBP", quality=QUALITY, method=METHOD)
            variants.append((width, height, filename))
    preferred = max((item for item in variants if item[0] <= 720), default=variants[0])
    return {
        "width": preferred[0],
        "height": preferred[1],
        "src": "/" + str(OUTPUT / preferred[2]),
        "srcset": ", ".join(f"/{OUTPUT / filename} {width}w" for width, _, filename in variants),
    }


def generate(root: Path = ROOT, output: Path = OUTPUT, manifest: Path = MANIFEST) -> dict[str, dict]:
    output_dir = root / output
    output_dir.mkdir(parents=True, exist_ok=True)
    result = {}
    for source_url in gallery_sources(root):
        source = root / source_url.lstrip("/")
        if not source.is_file():
            raise FileNotFoundError(source_url)
        result[source_url] = build_preview(source, output_dir)
    destination = root / manifest
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(json.dumps(result, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    return result


if __name__ == "__main__":
    generated = generate()
    print(f"Generated previews for {len(generated)} gallery originals")
