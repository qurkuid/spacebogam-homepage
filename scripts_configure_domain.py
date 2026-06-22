#!/usr/bin/env python3
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
CONFIG = ROOT / "site.config.json"
OLD = "https://qurkuid.github.io/spacebogam-homepage"


def html_files() -> list[Path]:
    files = list(ROOT.glob("*.html")) + list((ROOT / "blog").glob("*.html"))
    files += [ROOT / "sitemap.xml", ROOT / "robots.txt", ROOT / "feed.xml"]
    return [p for p in files if p.exists()]


def main() -> None:
    cfg = json.loads(CONFIG.read_text(encoding="utf-8"))
    target = sys.argv[1].rstrip("/") if len(sys.argv) > 1 else cfg.get("currentSiteUrl", OLD).rstrip("/")
    cfg["currentSiteUrl"] = target
    CONFIG.write_text(json.dumps(cfg, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    replacements = {
        OLD: target,
        cfg.get("candidateDomain", "https://ggbg.kr").rstrip("/"): target,
    }
    for path in html_files():
        text = path.read_text(encoding="utf-8", errors="ignore")
        new = text
        for a, b in replacements.items():
            new = new.replace(a, b)
        if new != text:
            path.write_text(new, encoding="utf-8")
            print("updated", path.relative_to(ROOT))
    cname = ROOT / "CNAME"
    if target.startswith("https://") and "github.io" not in target:
        cname.write_text(target.removeprefix("https://").removeprefix("http://") + "\n", encoding="utf-8")
        print("wrote CNAME")
    elif cname.exists():
        print("CNAME exists; remove manually only when intentionally returning to GitHub URL")
    print("site url", target)


if __name__ == "__main__":
    main()
