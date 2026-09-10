#!/usr/bin/env python3
# 공간보감 사이트 전역 내부 링크·자산 무결성 검사
# 사용: python3 tests/link_check.py
# 검사: 모든 HTML 의 로컬 href/src 가 실제 파일로 존재하는지 (디렉토리 링크는 index.html),
#       앵커(#id) 는 무시, 외부(http/mailto/tel/data) 무시.
import re, sys, pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
REF_RE = re.compile(r'''(?:href|src)=["']([^"']+)["']''')
SKIP_DIRS = {".git", ".claude", "logs", "node_modules", ".context", "tools", "tests"}


def pages():
    out = list(ROOT.glob("*.html"))
    for sub in ROOT.iterdir():
        if sub.is_dir() and sub.name not in SKIP_DIRS:
            out.extend(sub.rglob("index.html"))
    out.extend((ROOT / "blog").glob("*.html"))
    return sorted(set(out))


def check(page):
    html = page.read_text(encoding="utf-8")
    missing = []
    for m in REF_RE.finditer(html):
        ref = m.group(1)
        if not ref or ref.startswith(("http://", "https://", "mailto:", "tel:", "#", "data:", "//")):
            continue
        path = ref.split("?")[0].split("#")[0]
        if not path:
            continue
        base = ROOT if path.startswith("/") else page.parent
        target = (base / path.lstrip("/")).resolve()
        if path.endswith("/"):
            target = target / "index.html"
        if not target.exists():
            missing.append(ref)
    return missing


def main():
    total_missing = 0
    for p in pages():
        miss = check(p)
        if miss:
            total_missing += len(miss)
            print(f"[FAIL] {p.relative_to(ROOT)}: {len(miss)}건 — {miss[:4]}")
    n = len(pages())
    if total_missing:
        print(f"[FAIL] 총 깨진 참조 {total_missing}건 (페이지 {n})")
        return 1
    print(f"[PASS] 내부 링크·자산 OK — 페이지 {n}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
