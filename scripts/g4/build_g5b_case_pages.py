#!/usr/bin/env python3
"""CMP-1111 (G5b): extend the G4 private-preview case-detail template
(g4-private/sajik-42.html — .detail/.gallery/.related) to the 7 remaining
published case studies. Pulls title/images/body straight out of the live
case-*.html via BeautifulSoup so no facts are hand-retyped or invented.

Run: python3 scripts/g4/build_g5b_case_pages.py
Output: g4-private/{daewoo-ian-35py,geoje-hyundai-hometown,guseo-ssangyong,
hwamyeong-kolong,hwamyeong-lottecastle,oryukdo-sk-view,samhan-goldenview}.html
"""
import html
import re
from pathlib import Path
from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "g4-private"

GENERIC_FACT = (
    "비공개 제작 목적의 내부 프로젝트·사용자 소유 이미지 기반입니다. "
    "공개 전 사진별 권리, 실사 여부, 개인정보 제거 검수가 필요합니다."
)
MAX_GALLERY_IMAGES = 6

CASE_FILES = [
    "case-daewoo-ian-35py.html",
    "case-geoje-hyundai-hometown.html",
    "case-guseo-ssangyong.html",
    "case-hwamyeong-kolong.html",
    "case-hwamyeong-lottecastle.html",
    "case-oryukdo-sk-view.html",
    "case-samhan-goldenview.html",
]


def slug_of(name):
    return re.sub(r"^case-", "", name)[:-5]  # strip "case-" prefix and ".html"


def soup_of(name):
    return BeautifulSoup((ROOT / name).read_text(encoding="utf-8"), "html.parser")


def resolve_src(src):
    if src.startswith("/"):
        return ".." + src
    if src and not src.startswith("http"):
        return "../" + src
    return src


def og_description(doc):
    tag = doc.find("meta", attrs={"property": "og:description"})
    return (tag.get("content") or "").strip() if tag else ""


def project_uuid(main):
    for img in main.find_all("img"):
        m = re.search(r"assets/case/([0-9a-f-]{36})/", img.get("src", ""))
        if m:
            return m.group(1)
    return None


def gallery_images(main):
    scope = main.find("section", class_="case-shots") or main
    imgs = [
        img
        for img in scope.find_all("img")
        if "assets/case/" in (img.get("src") or "")
    ]
    return imgs[:MAX_GALLERY_IMAGES]


def related_links(main):
    seen, out = set(), []
    for a in main.find_all("a"):
        href = a.get("href", "")
        if href.startswith("blog/") and href not in seen:
            seen.add(href)
            out.append((href, a.get_text(" ", strip=True)))
    return out


def gallery_html(imgs, title):
    cells = []
    for i, img in enumerate(imgs):
        src = resolve_src(img.get("src", ""))
        alt = html.escape(img.get("alt") or title, quote=True)
        lazy = ' loading="lazy"' if i > 0 else ""
        cells.append(
            f'<a data-event="case_gallery_open" data-placement="case_gallery" href="{src}">'
            f'<img src="{src}" alt="{alt}"{lazy}></a>'
        )
    return (
        f'<div class="gallery" data-gallery aria-label="{html.escape(title, quote=True)} 갤러리">'
        f"{''.join(cells)}</div>"
    )


def related_html(links):
    if not links:
        return ""
    items = "".join(
        f'<p><a data-event="case_related_story_open" data-placement="related_story" '
        f'href="../{href}">{html.escape(text)}</a></p>'
        for href, text in links
    )
    return f'<section class="related"><h2>관련 콘텐츠</h2>{items}</section>'


def case_shell(title, body):
    return f"""<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow,noarchive"><title>{html.escape(title)} | G4</title><link rel="stylesheet" href="g4.css"></head>
<body data-page="case" data-project="{{project}}" data-creative="g4_editorial_web_v1" data-promise="living_before_decoration" data-landing="g4_private_case"><div class="notice"><div class="shell"><strong>PRIVATE G4 PREVIEW</strong> · 내부 검토용</div></div><main class="detail">
{body}
</main><script defer src="/assets/funnel-tracking.js?v=f696d170"></script><script src="g4-tracking.js"></script></body></html>
"""


def build_case(name):
    doc = soup_of(name)
    main = doc.find("main")
    h1 = main.find("h1").get_text(strip=True)
    lead_p = main.find("p", class_="lead")
    lede = lead_p.get_text(strip=True) if lead_p else og_description(doc)

    uuid = project_uuid(main)
    eyebrow = f"Project record · {uuid[:8]}…{uuid[-6:]}" if uuid else "Independent case record"

    imgs = gallery_images(main)
    links = related_links(main)
    slug = slug_of(name)
    project = slug.replace("-", "_")

    body = (
        f'<div class="eyebrow">{eyebrow}</div><h1>{html.escape(h1)}</h1>'
        f'<p class="lede">{html.escape(lede)}</p>\n'
        f"{gallery_html(imgs, h1)}\n"
        f'<div class="fact">{GENERIC_FACT}</div>'
        f'<div class="actions"><a class="button" data-event="phone_click" data-placement="case_actions" '
        f'data-cta="phone_consultation" href="tel:050713881252">전화로 조건 확인</a>'
        f'<a class="button primary" data-event="consultation_click" data-placement="case_actions" '
        f'data-cta="start_consultation" href="../consultation/apply/">상담 신청 시작</a></div>'
        f"{related_html(links)}"
        f'<p><a class="back" href="index.html">← 네 사례 목록</a></p>'
    )
    page = case_shell(h1, body).replace("{project}", project)
    (OUT / f"{slug}.html").write_text(page, encoding="utf-8")
    return slug


if __name__ == "__main__":
    built = [build_case(name) for name in CASE_FILES]
    print("done:", built)
