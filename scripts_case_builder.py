#!/usr/bin/env python3
"""Builds portfolio case pages (case-<slug>.html) from data/cases/cases.json
and keeps the portfolio.html grid in sync.

This is the NEW-5 minimal publishing flow: CEO (or content owner) edits
cases via case-admin.html, exports cases.json, and this script turns that
into real site pages using the site's existing design system classes
(hero/project/card/specs/case-gallery/phone-cta-panel) so new pages look
consistent with hand-built ones without needing new CSS.

Deliberately does NOT touch the 8 existing hand-authored case-*.html pages
(mega-centum, sajik, daewoo, geoje, ...) — those stay as-is. This only
manages cases listed in data/cases/cases.json.
"""
from __future__ import annotations

import json
import re
import sys
from dataclasses import dataclass, field
from pathlib import Path

from scripts.case_image_spec import check_image

ROOT = Path(__file__).resolve().parent
CASES_JSON = ROOT / "data" / "cases" / "cases.json"
SITE_URL = "https://spacebogam.kr"
BRAND = "공간보감"
KIND_LABELS = {"apartment": "아파트", "house": "주택", "commercial": "상업공간"}


@dataclass
class CaseImage:
    path: str  # site-root-relative, e.g. "assets/case/<slug>/thumb.jpg"
    alt: str
    phase: str = ""  # "전" | "후" | ""


@dataclass
class CaseEntry:
    slug: str
    title: str
    kind: str  # apartment | house | commercial
    location: str
    pyeong: str
    summary: str
    description: str
    thumbnail: CaseImage
    gallery: list[CaseImage] = field(default_factory=list)
    featured: bool = False
    photo_permission: str = "미확인"  # 허가 | 미확인 | 불가
    customer_name_visibility: str = "비노출"
    status: str = "draft"  # draft | published


def load_cases() -> list[CaseEntry]:
    raw = json.loads(CASES_JSON.read_text(encoding="utf-8"))
    out = []
    for item in raw:
        thumb = CaseImage(**item["thumbnail"])
        gallery = [CaseImage(**g) for g in item.get("gallery", [])]
        out.append(
            CaseEntry(
                slug=item["slug"],
                title=item["title"],
                kind=item["kind"],
                location=item.get("location", ""),
                pyeong=item.get("pyeong", ""),
                summary=item["summary"],
                description=item["description"],
                thumbnail=thumb,
                gallery=gallery,
                featured=item.get("featured", False),
                photo_permission=item.get("photo_permission", "미확인"),
                customer_name_visibility=item.get("customer_name_visibility", "비노출"),
                status=item.get("status", "draft"),
            )
        )
    return out


def validate_case(case: CaseEntry) -> list[str]:
    """Returns a list of blocking problems. Non-empty => do not publish."""
    problems: list[str] = []
    if case.photo_permission != "허가":
        problems.append(
            f"사진 사용 허가 상태가 '{case.photo_permission}' — '허가'가 아니면 게시할 수 없음"
        )
    if not case.thumbnail.alt.strip():
        problems.append("썸네일 alt 텍스트가 비어 있음")
    if len(case.gallery) < 1:
        problems.append("전/후 사진이 1장도 없음 (최소 1장 필요)")
    for img in case.gallery:
        if not img.alt.strip():
            problems.append(f"{img.path}: alt 텍스트가 비어 있음")
    if "가격" in case.description or "견적" in case.description:
        problems.append("본문에 가격/견적 확정으로 오해될 표현이 있는지 확인 필요 (CEO 승인 없이 가격 확정 금지)")

    thumb_path = ROOT / case.thumbnail.path
    for p in check_image(thumb_path, role="thumbnail"):
        problems.append(f"썸네일({case.thumbnail.path}): {p}")
    for img in case.gallery:
        for p in check_image(ROOT / img.path, role="detail"):
            problems.append(f"{img.path}: {p}")
    return problems


def _json_ld(case: CaseEntry) -> str:
    url = f"{SITE_URL}/case-{case.slug}.html"
    data = {
        "@context": "https://schema.org",
        "@type": "CreativeWork",
        "name": case.title,
        "url": url,
        "image": f"{SITE_URL}/{case.thumbnail.path}",
        "contentLocation": case.location,
        "description": case.description,
        "publisher": {"@type": "LocalBusiness", "name": BRAND, "url": f"{SITE_URL}/"},
    }
    breadcrumb = {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        "itemListElement": [
            {"@type": "ListItem", "position": 1, "name": "홈", "item": f"{SITE_URL}/"},
            {"@type": "ListItem", "position": 2, "name": "포트폴리오", "item": f"{SITE_URL}/portfolio.html"},
            {"@type": "ListItem", "position": 3, "name": case.title, "item": url},
        ],
    }
    return (
        f'<script type="application/ld+json">{json.dumps(data, ensure_ascii=False)}</script>'
        f'<script type="application/ld+json">{json.dumps(breadcrumb, ensure_ascii=False)}</script>'
    )


HEAD_TRACKING = """  <!-- Google tag (gtag.js) -->
  <script async src="https://www.googletagmanager.com/gtag/js?id=G-EJGXDD5C1T"></script>
  <script>
    window.dataLayer = window.dataLayer || [];
    function gtag(){dataLayer.push(arguments);}
    gtag('js', new Date());

    gtag('config', 'G-EJGXDD5C1T');
  </script>
  <link rel="icon" href="/favicon.ico" sizes="any" />
  <link rel="icon" href="/assets/favicon.svg" type="image/svg+xml" />
  <script src="/assets/site-canonical.js?v=c69a8498"></script>
  <script defer src="/assets/site-tracking.js?v=8ecc6ade"></script>
<!-- Meta Pixel Code -->
<script>
!function(f,b,e,v,n,t,s)
{if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};
if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];
s.parentNode.insertBefore(t,s)}(window, document,'script',
'https://connect.facebook.net/en_US/fbevents.js');
fbq('init', '512750840350337');
fbq('track', 'PageView');
</script>
<!-- End Meta Pixel Code -->
<!-- Naver WCS / CTS common tracking -->
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
</script>"""

GTM_HEAD = """<!-- Google Tag Manager -->
<script>(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
})(window,document,'script','dataLayer','GTM-PW8GLP8S');</script>
<!-- End Google Tag Manager -->"""

GTM_BODY = """<!-- Google Tag Manager (noscript) -->
<noscript><iframe src="https://www.googletagmanager.com/ns.html?id=GTM-PW8GLP8S"
height="0" width="0" style="display:none;visibility:hidden"></iframe></noscript>
<!-- End Google Tag Manager (noscript) -->
<noscript><img height="1" width="1" style="display:none" src="https://www.facebook.com/tr?id=512750840350337&ev=PageView&noscript=1" alt="" aria-hidden="true" /></noscript>"""

HEADER = """<header class="top"><div class="wrap"><a class="brand" href="index.html">공간보감</a><nav class="nav"><a href="overview.html">회사소개</a><a href="process.html">진행과정</a><a href="portfolio.html">포트폴리오</a><a href="/consultation/">상담</a><a href="living.html">주거</a><a href="commercial.html">상업공간</a><a href="estimate.html">견적준비</a><a href="guides.html">가이드</a><a href="qna.html">Q&amp;A</a></nav><a class="cta" href="/consultation/">상담 신청</a></div></header>"""

FOOTER = """<footer><div class="wrap">공간보감 · 부산 인테리어 상담 · <a href="/consultation/">상담 신청</a></div><div class="wrap foot-legal"><a href="/privacy/">개인정보처리방침</a></div></footer>"""

PHONE_CTA = """<section class="phone-cta-panel" aria-label="전화 상담"><div class="wrap phone-cta-inner"><p class="phone-cta-kicker">전화 상담</p><h2>비슷한 현장 전화 상담하기</h2><p>이 사례와 비슷한 현장 조건을 전화로 먼저 확인해 보세요.</p><a class="btn call phone-cta-link" data-cta-location="portfolio_case_call_panel" href="tel:050713881252">비슷한 현장 전화 상담하기</a></div></section>"""


def render_case_html(case: CaseEntry) -> str:
    url = f"{SITE_URL}/case-{case.slug}.html"
    title_tag = f"{case.title} 인테리어 사례 | {BRAND}"
    gallery_items = "".join(
        f'<a href="/{img.path}" target="_blank" rel="noopener"><img src="/{img.path}" loading="lazy" alt="{img.alt}"></a>'
        for img in case.gallery
    )
    return f"""<!doctype html><html lang="ko"><head>
{GTM_HEAD}
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>{title_tag}</title><meta name="description" content="{case.summary}"><meta name="robots" content="index,follow,max-image-preview:large,max-snippet:-1"><link rel="canonical" href="{url}"><meta property="og:type" content="website"><meta property="og:title" content="{title_tag}"><meta property="og:description" content="{case.summary}"><meta property="og:url" content="{url}">{_json_ld(case)}<link rel="stylesheet" href="assets/page.css" />
{HEAD_TRACKING}
</head><body>
{GTM_BODY}
{HEADER}
<main><section class="hero"><div class="wrap"><div class="crumb"><a href="index.html">홈</a> / {case.title} 인테리어 사례</div><div class="eyebrow">{BRAND}</div><h1>{case.title} 인테리어 사례</h1><p class="lead">{case.summary}</p></div></section>
<section><div class="wrap project"><a class="photo" href="/{case.thumbnail.path}" target="_blank" rel="noopener"><img src="/{case.thumbnail.path}" alt="{case.thumbnail.alt}"></a><article class="card"><div class="kicker">사례 정보</div><h2>{case.title}</h2><p>{case.description}</p><div class="specs"><div class="spec"><b>유형</b><span>{KIND_LABELS.get(case.kind, case.kind)}</span></div><div class="spec"><b>위치</b><span>{case.location}</span></div><div class="spec"><b>평형</b><span>{case.pyeong}</span></div></div><a class="button" href="/consultation/">이 집을 보고 상담하기</a><a class="ghost" href="portfolio.html">전체 사례도 보기</a></article></div></section>
<section class="case-shots"><div class="wrap"><div class="head"><div class="kicker">현장 사진</div><div><h2>현장 사진</h2><p>실제 시공 현장 사진입니다. 사진을 누르면 크게 볼 수 있습니다.</p></div></div><div class="case-gallery">{gallery_items}</div></div></section>
{PHONE_CTA}
</main>
{FOOTER}
<script src="assets/lightbox.js" defer></script></body></html>"""


PORTFOLIO_HTML = ROOT / "portfolio.html"
_CARD_TEMPLATE = (
    '<article data-kind="{kind}">'
    '<a href="case-{slug}.html" data-v8-event="portfolio_project_open" data-project="{slug}">'
    '<img src="/{thumb_path}" alt="{thumb_alt}">'
    "<h2>{title}</h2>"
    "<p>{location} · {pyeong}</p>"
    "</a></article>"
)


def sync_portfolio_grid(cases: list[CaseEntry]) -> bool:
    """Adds/updates managed-case cards inside the v8-grid. Idempotent.
    Marks managed cards with a data-managed-by="case-admin" attribute so
    re-runs update in place instead of duplicating."""
    html = PORTFOLIO_HTML.read_text(encoding="utf-8")
    grid_marker = '<section class="v8-grid" aria-label="프로젝트 목록">'
    idx = html.find(grid_marker)
    if idx == -1:
        raise RuntimeError("portfolio.html: v8-grid 섹션을 찾을 수 없음 — 수동 확인 필요")
    insert_at = idx + len(grid_marker)

    # strip any previously-injected managed cards so this is a clean re-sync
    html = re.sub(r'<article data-kind="[^"]*" data-managed-by="case-admin">.*?</article>', "", html)

    cards = []
    for case in cases:
        if case.status != "published":
            continue
        card = _CARD_TEMPLATE.format(
            kind=case.kind,
            slug=case.slug,
            thumb_path=case.thumbnail.path,
            thumb_alt=case.thumbnail.alt,
            title=case.title,
            location=case.location,
            pyeong=case.pyeong,
        )
        card = card.replace(f'data-kind="{case.kind}"', f'data-kind="{case.kind}" data-managed-by="case-admin"', 1)
        cards.append(card)
    if not cards:
        PORTFOLIO_HTML.write_text(html, encoding="utf-8")
        return False

    idx = html.find(grid_marker)
    insert_at = idx + len(grid_marker)
    new_html = html[:insert_at] + "".join(cards) + html[insert_at:]
    PORTFOLIO_HTML.write_text(new_html, encoding="utf-8")
    return True


def build_all(write: bool = True) -> dict:
    cases = load_cases()
    published, skipped = [], []
    for case in cases:
        problems = validate_case(case)
        if case.status == "published" and problems:
            skipped.append((case, problems))
            continue
        if case.status != "published":
            skipped.append((case, ["status != published (초안 상태)"]))
            continue
        published.append(case)
        if write:
            out_path = ROOT / f"case-{case.slug}.html"
            out_path.write_text(render_case_html(case), encoding="utf-8")
    if write:
        sync_portfolio_grid(cases)
    return {"published": published, "skipped": skipped}
