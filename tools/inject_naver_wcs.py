#!/usr/bin/env python3
# 네이버 WCS/CTS 공통 트래킹 스니펫을 전 HTML 페이지 <head> 에 멱등 주입
# (2026-07-14 맥미니 서버 수기 설치분을 리포로 흡수 — GTM 때(b223d96)와 동일한 import 패턴)
# 사용:
#   python3 tools/inject_naver_wcs.py --dry-run
#   python3 tools/inject_naver_wcs.py
import sys, pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
MARKER = 'data-spacebogam-naver-wcs="1"'
SNIPPET = '''<!-- Naver WCS / CTS common tracking -->
<script type="text/javascript" src="//wcs.naver.net/wcslog.js" data-spacebogam-naver-wcs="1"></script>
<script type="text/javascript">
if (!window.wcs_add) window.wcs_add = {};
window.wcs_add["wa"] = "s_7702568df18";
if (!window._nasa) window._nasa = {};
if (window.wcs) {
  window.wcs.inflow("spacebogam.kr");
  window.wcs_do();
  window.__spacebogamNaverCtsPvSent = true;
}
</script>
'''
PIXEL_END = '<!-- End Meta Pixel Code -->\n'


def targets():
    out = list(ROOT.glob("*.html"))
    for sub in ROOT.iterdir():
        if sub.is_dir() and sub.name not in {".git", ".claude", "assets", "tests", "tools", "logs", "data", "node_modules", ".context"}:
            out.extend(sub.rglob("*.html"))
    return sorted(set(out))


def main():
    dry = "--dry-run" in sys.argv
    changed, done, skipped = [], [], []
    for p in targets():
        html = p.read_text(encoding="utf-8")
        if MARKER in html:
            done.append(p)
            continue
        if PIXEL_END in html:
            new = html.replace(PIXEL_END, PIXEL_END + SNIPPET, 1)
        elif "</head>" in html:
            new = html.replace("</head>", SNIPPET + "</head>", 1)
        else:
            skipped.append(p)
            continue
        changed.append(p)
        if not dry:
            p.write_text(new, encoding="utf-8")
    print(f"{'[DRY-RUN] ' if dry else ''}주입 {len(changed)} · 이미 있음 {len(done)} · 대상 아님 {len(skipped)}")
    for p in skipped:
        print(f"  ! head 없음: {p.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
