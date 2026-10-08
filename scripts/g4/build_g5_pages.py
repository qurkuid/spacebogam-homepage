#!/usr/bin/env python3
"""CMP-1095 (G5): extend the G4 private-preview design system to the
remaining hub page categories named in the issue (process/portfolio list/
estimate/guides/qna/living/commercial). Pulls real copy straight out of the
live static pages via BeautifulSoup so no facts are hand-retyped or invented.

Run: python3 scripts/g4/build_g5_pages.py
Output: g4-private/{process,portfolio,estimate,guides,qna,living,commercial}.html
"""
import re
from pathlib import Path
from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "g4-private"


def soup_of(name):
    return BeautifulSoup((ROOT / name).read_text(encoding="utf-8"), "html.parser")


def text(el):
    return el.get_text(" ", strip=True) if el else ""


NAV = (
    '<a href="index.html#cases">사례</a><a href="index.html#method">작업 방식</a>'
    '<a href="about.html">공간보감 소개</a>'
)


def shell(page, title, body, landing=None):
    landing = landing or f"g4_private_{page}"
    return f"""<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow,noarchive"><title>{title} | G4</title><link rel="stylesheet" href="g4.css"></head>
<body data-page="{page}" data-creative="g4_editorial_web_v1" data-promise="living_before_decoration" data-landing="{landing}"><div class="notice"><div class="shell"><strong>PRIVATE G4 PREVIEW</strong> · 사용자 소유 이미지 기반의 내부 검토용 시안입니다. 외부 공개·운영 적용 금지.</div></div><header class="shell sitehead"><a class="brand" href="index.html">공간보감</a><nav aria-label="주요 메뉴">{NAV}</nav><a class="cta" data-event="consultation_click" data-placement="header" data-cta="start_consultation" href="../consultation/apply/">프로젝트 적합성 확인</a></header><main class="detail">
{body}
</main><footer class="shell footer"><nav aria-label="하단 메뉴">{NAV}</nav>공간보감 · G4 비공개 작동 시안 · 공개 전 사진 권리 및 개인정보 별도 검수</footer><script defer src="/assets/funnel-tracking.js"></script><script src="g4-tracking.js"></script></body></html>
"""


def step(label, title, para):
    return f'<article class="step"><b>{label}</b><h3>{title}</h3><p>{para}</p></article>'


def card(href, title, sub, extra=""):
    return f'<a class="card" href="{href}">{extra}<h3>{title}</h3><p>{sub}</p></a>'


# ---------------------------------------------------------------- process --
def build_process():
    doc = soup_of("process.html")
    main = doc.find("main")
    h1 = text(main.find("h1"))
    lede = text(main.find("p"))
    h3s = main.find_all("h3")
    steps_html = "".join(
        step(f"0{i+1}", text(h3), text(h3.find_next_sibling("p")))
        for i, h3 in enumerate(h3s)
    )
    faq_items = main.select("div.pr-q")
    faq_html = "".join(
        step(f"Q{i+1}", text(it.find("b")), text(it.find("p")))
        for i, it in enumerate(faq_items)
    )
    body = f"""<div class="eyebrow">How we work</div><h1>{h1}</h1><p class="lede">{lede}</p>
<section class="section"><h2>{len(h3s)}단계로 흘러갑니다</h2><div class="steps">{steps_html}</div></section>
<section class="section"><h2>진행 중 많이 묻는 것들</h2><div class="steps">{faq_html}</div></section>
<div class="actions"><a class="button" data-event="phone_click" data-placement="process_actions" data-cta="phone_consultation" href="tel:050713881252">전화로 조건 확인</a><a class="button primary" data-event="consultation_click" data-placement="process_actions" data-cta="start_consultation" href="../consultation/apply/">상담 신청 시작</a></div>
<a class="back" href="index.html">← 대표 시안으로 돌아가기</a>"""
    (OUT / "process.html").write_text(shell("process", "진행 과정", body), encoding="utf-8")


# -------------------------------------------------------------- portfolio --
CASE_FILES = [
    "case-daewoo-ian-35py.html",
    "case-geoje-hyundai-hometown.html",
    "case-guseo-ssangyong.html",
    "case-hwamyeong-kolong.html",
    "case-hwamyeong-lottecastle.html",
    "case-mega-centum-49py.html",
    "case-oryukdo-sk-view.html",
    "case-sajik-ssangyong.html",
    "case-samhan-goldenview.html",
]
# already-built G4 detail templates (kept as their own project records, see
# g1-audit note: 42py/32py are separate projects, no substitute allowed)
# CMP-1111 (G5b) added the remaining 7 via scripts/g4/build_g5b_case_pages.py
G4_DETAIL = {
    "case-sajik-ssangyong.html": "sajik-42.html",
    "case-mega-centum-49py.html": "mega-49.html",
    "case-daewoo-ian-35py.html": "daewoo-ian-35py.html",
    "case-geoje-hyundai-hometown.html": "geoje-hyundai-hometown.html",
    "case-guseo-ssangyong.html": "guseo-ssangyong.html",
    "case-hwamyeong-kolong.html": "hwamyeong-kolong.html",
    "case-hwamyeong-lottecastle.html": "hwamyeong-lottecastle.html",
    "case-oryukdo-sk-view.html": "oryukdo-sk-view.html",
    "case-samhan-goldenview.html": "samhan-goldenview.html",
}


def build_portfolio():
    cards = []
    for name in CASE_FILES:
        doc = soup_of(name)
        main = doc.find("main")
        h1 = text(main.find("h1"))
        img = main.find("img")
        src = img.get("src") if img else ""
        alt = img.get("alt") if img else h1
        if src.startswith("/"):
            src = ".." + src
        elif src and not src.startswith("http"):
            src = "../" + src
        href = G4_DETAIL.get(name, f"../{name}")
        img_html = f'<img src="{src}" alt="{alt}">' if src else ""
        cards.append(card(href, h1, "공간보감 실제 시공 사례", img_html))
    geoje47 = card(
        "geoje-47.html",
        "거제유림아시아드 · 47평",
        "내부 보유 이미지 연결 · 사례 상세는 G4 비공개 시안에서 우선 확인",
    )
    sajik32 = card(
        "sajik-32.html",
        "사직쌍용예가 1차 · 32평",
        "42평과 별도 프로젝트 · 원장 ID·완료일 확인 전 임시 비공개 시안",
    )
    body = f"""<div class="eyebrow">Portfolio</div><h1>공간보감이 진행한 실제 현장</h1><p class="lede">사진의 분위기보다 생활 방식과 기존 현장의 조건을 먼저 살핀 프로젝트 9건입니다. 각 사례는 별도 기록으로 관리하며, 자료가 확보되지 않은 사례는 대체 프로젝트를 넣지 않습니다.</p>
<section class="section"><h2>공개 사례 9건</h2><div class="grid">{''.join(cards)}</div></section>
<section class="section"><h2>내부 검토 중인 대표 사례 2건</h2><p>운영 사이트에 정식 사례 페이지가 없어 G4 비공개 시안에서만 우선 확인할 수 있습니다.</p><div class="grid">{geoje47}{sajik32}</div></section>
<a class="back" href="index.html">← 대표 시안으로 돌아가기</a>"""
    (OUT / "portfolio.html").write_text(shell("portfolio", "포트폴리오", body), encoding="utf-8")


# ---------------------------------------------------------------- estimate --
def build_estimate():
    doc = soup_of("estimate.html")
    main = doc.find("main")
    h1 = text(main.find("h1"))
    lede = text(main.find("p", class_="lead") or main.find("p"))
    fields = [text(f) for f in main.find_all("div", class_="field")]
    fields_html = "".join(step(f"{i+1:02d}", f, "") for i, f in enumerate(fields))

    living = soup_of("estimate-living.html").find("main")
    living_h1 = text(living.find("h1"))
    living_p = text(living.find("p"))
    commercial = soup_of("estimate-commercial.html").find("main")
    commercial_h1 = text(commercial.find("h1"))
    commercial_p = text(commercial.find("p"))

    body = f"""<div class="eyebrow">Before you ask</div><h1>{h1}</h1><p class="lede">{lede}</p>
<section class="section"><h2>준비하면 좋은 항목 10가지</h2><div class="steps">{fields_html}</div></section>
<section class="section"><h2>주거 vs 상업, 확인 축이 다릅니다</h2><div class="grid">
<div class="card"><h3>{living_h1}</h3><p>{living_p}</p></div>
<div class="card"><h3>{commercial_h1}</h3><p>{commercial_p}</p></div>
</div></section>
<div class="actions"><a class="button" data-event="phone_click" data-placement="estimate_actions" data-cta="phone_consultation" href="tel:050713881252">전화로 견적 범위 확인</a><a class="button primary" data-event="consultation_click" data-placement="estimate_actions" data-cta="start_consultation" href="../consultation/apply/">상담 신청 시작</a></div>
<a class="back" href="index.html">← 대표 시안으로 돌아가기</a>"""
    (OUT / "estimate.html").write_text(shell("estimate", "견적 준비", body), encoding="utf-8")


# ------------------------------------------------------------------ guides --
def build_guides():
    doc = soup_of("guides.html")
    main = doc.find("main")
    h1 = text(main.find("h1"))
    lede = text(main.find("p"))
    links = []
    seen = set()
    for a in main.find_all("a"):
        href = a.get("href", "")
        b, span = a.find("b"), a.find("span")
        if href.endswith(".html") and "guide" in href and href not in seen and b:
            seen.add(href)
            links.append((href, text(b), text(span)))
    cards = "".join(card(f"../{href}", title, sub) for href, title, sub in links)
    body = f"""<div class="eyebrow">Guides</div><h1>{h1}</h1><p class="lede">{lede}</p>
<section class="section"><h2>준비 가이드 {len(links)}편</h2><div class="grid">{cards}</div></section>
<a class="back" href="index.html">← 대표 시안으로 돌아가기</a>"""
    (OUT / "guides.html").write_text(shell("guides", "가이드", body), encoding="utf-8")


# --------------------------------------------------------------------- qna --
def build_qna():
    doc = soup_of("qna.html")
    main = doc.find("main")
    sections = main.find_all("section", recursive=False)
    blocks = []
    for sec in sections:
        h2 = sec.find("h2")
        if not h2 or "여기 없는" in text(h2) or "안내" in text(h2):
            continue
        items = sec.find_all("div", class_="faq-item")
        if not items:
            continue
        faq_html = "".join(
            step(
                re.match(r"Q\d+", text(it.find("b"))).group(),
                text(it.find("b")).split(". ", 1)[-1],
                text(it.find("p")),
            )
            for it in items
        )
        blocks.append(f'<section class="section"><h2>{text(h2)}</h2><div class="steps">{faq_html}</div></section>')
    body = f"""<div class="eyebrow">Q&amp;A</div><h1>{text(main.find('h1'))}</h1><p class="lede">견적·진행·실측·자재·계약·구축 아파트까지, 상담 전에 가장 많이 묻는 질문을 그대로 옮겼습니다.</p>
{''.join(blocks)}
<a class="back" href="index.html">← 대표 시안으로 돌아가기</a>"""
    (OUT / "qna.html").write_text(shell("qna", "자주 묻는 질문", body), encoding="utf-8")


# ------------------------------------------------------------ living/comm --
def build_living():
    doc = soup_of("living.html")
    main = doc.find("main")
    h1 = text(main.find("h1"))
    lede = text(main.find("p"))
    cards = "".join(
        card(f"../{a['href']}", text(a.find("b")), text(a.find("span")))
        for a in main.select("div.links a")
    )
    body = f"""<div class="eyebrow">Living</div><h1>{h1}</h1><p class="lede">{lede}</p>
<section class="section"><h2>평형별 사례</h2><div class="grid">{cards}</div></section>
<a class="back" href="index.html">← 대표 시안으로 돌아가기</a>"""
    (OUT / "living.html").write_text(shell("living", "주거 포트폴리오", body), encoding="utf-8")


def build_commercial():
    doc = soup_of("commercial.html")
    main = doc.find("main")
    h1 = text(main.find("h1"))
    lede = text(main.find("p"))
    links = []
    seen = set()
    for a in main.find_all("a"):
        href = a.get("href", "")
        if href.endswith(".html") and ("commercial" in href or href == "office.html") and href not in seen:
            seen.add(href)
            links.append((href, a))
    cards = "".join(
        card(f"../{href}", text(a).split(" ", 1)[0], " ".join(text(a).split(" ")[1:]))
        for href, a in links
    )
    check_cards = main.select("div.cards > article.card")
    check_html = "".join(
        step(f"0{i+1}", text(c.find("b")), text(c.find("p")))
        for i, c in enumerate(check_cards)
    )
    body = f"""<div class="eyebrow">Commercial</div><h1>{h1}</h1><p class="lede">{lede}</p>
<section class="section"><h2>업종별 랜딩</h2><div class="grid">{cards}</div></section>
<section class="section"><h2>상담 때 함께 확인하는 것</h2><div class="steps">{check_html}</div></section>
<a class="back" href="index.html">← 대표 시안으로 돌아가기</a>"""
    (OUT / "commercial.html").write_text(shell("commercial", "상업공간 포트폴리오", body), encoding="utf-8")


# ------------------------------------------------------------------- blog --
def build_blog():
    doc = soup_of("blog.html")
    hero = doc.find("section", class_="hero")
    h1 = text(hero.find("h1"))
    lede = text(hero.find("p"))
    posts = doc.select("article.post-card")
    cards = []
    for p in posts:
        h2a = p.find("h2").find("a")
        href = h2a.get("href", "")
        title = text(h2a)
        cat = text(p.find("span", class_="cat"))
        date = text(p.select_one("div.meta span"))
        img = p.find("img")
        src = img.get("src") if img else ""
        alt = img.get("alt") if img else title
        if src.startswith("/"):
            src = ".." + src
        img_html = f'<img src="{src}" alt="{alt}" loading="lazy">' if src else ""
        sub = f"{cat} · {date}" if cat and date else (cat or date)
        cards.append(card(f"../{href}", title, sub, img_html))
    body = f"""<div class="eyebrow">Blog</div><h1>{h1}</h1><p class="lede">{lede}</p>
<section class="section"><h2>게시물 {len(posts)}건</h2><div class="grid">{''.join(cards)}</div></section>
<a class="back" href="index.html">← 대표 시안으로 돌아가기</a>"""
    (OUT / "blog.html").write_text(shell("blog", "블로그", body), encoding="utf-8")


if __name__ == "__main__":
    OUT.mkdir(exist_ok=True)
    build_process()
    build_portfolio()
    build_estimate()
    build_guides()
    build_qna()
    build_living()
    build_commercial()
    build_blog()
    print("done:", sorted(p.name for p in OUT.glob("*.html")))
