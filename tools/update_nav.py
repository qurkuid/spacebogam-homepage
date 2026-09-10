#!/usr/bin/env python3
# 공간보감 전 페이지 nav 일괄 갱신 — 멱등 (이미 반영된 파일은 건너뜀)
# 사용:
#   python3 tools/update_nav.py --dry-run   # 변경 대상만 출력
#   python3 tools/update_nav.py             # 적용
#
# 규칙:
#   - <nav class="nav">...</nav> 가 정확히 1개인 파일만 대상 (0개는 스킵, 2개 이상은 FAIL)
#   - nav 안에 qna.html 링크가 이미 있으면 스킵 (멱등)
#   - prefix 는 nav 내부의 기존 portfolio.html 링크에서 추론 ("", "/", "../")
#   - </nav> 직전에 <a href="{p}guides.html">가이드</a><a href="{p}qna.html">Q&amp;A</a> 삽입
import re, sys, pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
NAV_RE = re.compile(r'<nav class="nav">(.*?)</nav>', re.S)
PREFIX_RE = re.compile(r'href="((?:\.\./|/)?)portfolio\.html"')


def targets():
    out = list(ROOT.glob("*.html"))
    for sub in ROOT.iterdir():
        if sub.is_dir() and sub.name not in {".git", ".claude", "assets", "tests", "tools", "logs", "data", "node_modules", ".context"}:
            out.extend(sub.glob("index.html"))
            if sub.name == "ab":
                out.extend(sub.glob("*/index.html"))
    out.extend((ROOT / "blog").glob("*.html"))
    return sorted(set(out))


def main():
    dry = "--dry-run" in sys.argv
    changed, skipped_no_nav, skipped_done, failed = [], [], [], []
    for p in targets():
        html = p.read_text(encoding="utf-8")
        navs = NAV_RE.findall(html)
        if len(navs) == 0:
            skipped_no_nav.append(p)
            continue
        if len(navs) > 1:
            failed.append((p, f"nav {len(navs)}개"))
            continue
        nav_inner = navs[0]
        if "qna.html" in nav_inner:
            skipped_done.append(p)
            continue
        m = PREFIX_RE.search(nav_inner)
        if not m:
            failed.append((p, "portfolio.html 링크 없음 — prefix 추론 불가"))
            continue
        prefix = m.group(1)
        addition = f'<a href="{prefix}guides.html">가이드</a><a href="{prefix}qna.html">Q&amp;A</a>'
        new_nav = f'<nav class="nav">{nav_inner}{addition}</nav>'
        new_html = html.replace(f'<nav class="nav">{nav_inner}</nav>', new_nav, 1)
        if new_html == html:
            failed.append((p, "치환 실패"))
            continue
        changed.append((p, prefix))
        if not dry:
            p.write_text(new_html, encoding="utf-8")

    print(f"{'[DRY-RUN] ' if dry else ''}변경 {len(changed)} · 이미 반영 {len(skipped_done)} · nav 없음 {len(skipped_no_nav)} · 실패 {len(failed)}")
    for p, prefix in changed[:10]:
        print(f"  + {p.relative_to(ROOT)} (prefix='{prefix}')")
    if len(changed) > 10:
        print(f"  ... 외 {len(changed) - 10}건")
    for p, why in failed:
        print(f"  ! {p.relative_to(ROOT)}: {why}")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
