#!/usr/bin/env python3
from __future__ import annotations

import json
import re
import subprocess
import sys
import textwrap
import html
from dataclasses import dataclass, asdict
from datetime import datetime
from email.utils import parsedate_to_datetime
from pathlib import Path
from urllib.parse import urlparse
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parent
RSS_URL = "https://rss.blog.naver.com/baek1985.xml"
BLOG_ID = "baek1985"
SITE_URL = "https://qurkuid.github.io/spacebogam-homepage"
BRAND = "공간보감"
NAVER_BLOG = "https://blog.naver.com/baek1985"
INSTAGRAM = "https://instagram.com/ggbg.official"
INSANE_ROOT = Path("/tmp/insane-search/skills/insane-search")
INSANE_PY = Path("/tmp/insane-search/.venv/bin/python")

@dataclass
class BlogPost:
    slug: str
    title: str
    date: str
    category: str
    tags: list[str]
    excerpt: str
    cover: str
    source: str
    html: str


def run(cmd: list[str], cwd: Path | None = None, timeout: int = 180) -> str:
    p = subprocess.run(cmd, cwd=str(cwd or ROOT), text=True, capture_output=True, timeout=timeout)
    if p.returncode != 0:
        raise RuntimeError(p.stderr + "\n" + p.stdout)
    return p.stdout


def fetch_url(url: str, out: Path) -> None:
    if INSANE_ROOT.exists() and INSANE_PY.exists():
        cmd = [str(INSANE_PY), "-m", "engine", url, "--selector", "title"]
        env_prefix = f"PYTHONPATH={INSANE_ROOT}"
        p = subprocess.run(" ".join([env_prefix] + [sh_quote(x) for x in cmd]), shell=True, cwd=str(INSANE_ROOT), text=True, capture_output=True, timeout=240)
        if p.returncode == 0:
            out.write_text(p.stdout, encoding="utf-8")
            return
    data = run(["python3", "-c", f"from urllib.request import urlopen; print(urlopen({url!r},timeout=30).read().decode('utf-8','ignore'))"], timeout=60)
    out.write_text(data, encoding="utf-8")


def sh_quote(s: str) -> str:
    return "'" + s.replace("'", "'\\''") + "'"


def slugify(title: str, link: str) -> str:
    log = re.search(r"/(\d+)", link)
    logno = log.group(1) if log else ""
    base = re.sub(r"[^0-9A-Za-z가-힣]+", "-", title).strip("-").lower()
    # Korean URLs work but keep slugs compact and stable with log number.
    key = "-".join(base.split("-")[:7])
    return f"{logno}-{key}" if logno else key[:80]


def clean_text(s: str) -> str:
    s = html.unescape(s or "")
    s = re.sub(r"<[^>]+>", " ", s)
    s = re.sub(r"\s+", " ", s).strip()
    return s


def category_for(title: str, text: str) -> str:
    hay = title + " " + text
    if any(k in hay for k in ["견적", "비용", "업체 추천", "상담", "계약"]):
        return "견적·상담"
    if any(k in hay for k in ["화명", "대우이안", "코오롱", "롯데캐슬"]):
        return "화명동·북구"
    if any(k in hay for k in ["해운대", "센텀", "좌동"]):
        return "해운대·센텀"
    if any(k in hay for k in ["구서", "금정"]):
        return "금정구·구서동"
    if any(k in hay for k in ["카페", "병원", "상업", "사무실", "매장"]):
        return "상업공간"
    return "아파트 인테리어"


def tags_for(title: str, text: str) -> list[str]:
    candidates = ["부산 인테리어", "부산 아파트 인테리어", "부산 리모델링", "30평대", "40평대", "50평대", "화명동", "해운대", "구서동", "금정구", "견적", "비용", "상담", "반려동물", "신혼집", "구축 아파트", "포트폴리오"]
    hay = title + " " + text
    tags = [x for x in candidates if x in hay]
    return tags[:8] or ["공간보감"]


def extract_post_html(raw: str, rss_desc: str) -> tuple[str, str]:
    cover = ""
    og = re.search(r'<meta property="og:image" content="([^"]+)"', raw)
    if og:
        cover = html.unescape(og.group(1))
    text = ""
    try:
        from bs4 import BeautifulSoup  # type: ignore[import-not-found]  # optional; used by the import environment
        soup = BeautifulSoup(raw, "lxml")
        if not cover:
            meta = soup.find("meta", attrs={"property":"og:image"})
            if meta and meta.get("content"):
                cover = meta["content"]
        body_el = soup.select_one(".se-main-container") or soup.select_one("#postViewArea")
        if body_el:
            if not cover:
                img = body_el.select_one("img")
                if img:
                    cover = img.get("data-lazy-src") or img.get("src") or ""
            blocks = []
            text_nodes = body_el.select(".se-module-text") or body_el.select("p, h2, h3, li, blockquote")
            for el in text_nodes:
                t = " ".join(el.get_text(" ", strip=True).split())
                if not t or t in blocks:
                    continue
                if t in {"상담문의", "전화문의", "인스타그램"}:
                    continue
                if "bit.ly" in t or "www.instagram.com" in t or "blog.naver.com" in t:
                    continue
                blocks.append(t)
            text = " ".join(blocks)
    except Exception:
        text = ""
    if not text:
        # Fallback without BeautifulSoup.
        m = re.search(r'<div[^>]+class="[^"]*se-main-container[^"]*"[^>]*>(.*)', raw, re.S)
        body = m.group(1) if m else raw
        body = re.sub(r"<script.*?</script>|<style.*?</style>", " ", body, flags=re.S|re.I)
        if not cover:
            img = re.search(r'<img[^>]+(?:src|data-lazy-src)="([^"]+)"', body)
            if img:
                cover = html.unescape(img.group(1))
        body = re.sub(r"</(p|div|li|h[1-6]|blockquote)>", "\n", body, flags=re.I)
        text = clean_text(body)
    # Naver pages include lots of chrome. If extraction is noisy, use RSS excerpt.
    if len(text) < 300 or ("블로그" in text[:120] and len(rss_desc) > 100):
        text = clean_text(rss_desc)
    text = text.replace("\u200b", " ").replace("\xa0", " ")
    text = re.sub(r"\s+", " ", text).strip()
    # Homepage-friendly cleanup: remove repeated greetings only lightly; do not invent content.
    text = re.sub(r"안녕하세요[,. ]*사람을 위한 인테리어[,. ]*공간보감 대표 백창석입니다[.]?", "", text).strip()
    text = re.sub(r"안녕하세요[,. ]*사람을 위한 인테리어[,. ]*공간보감입니다[.]?", "", text).strip()
    text = re.sub(r"(다\\.)\\s+", r"\\1\n", text)
    text = re.sub(r"([.!?。])\\s+", r"\\1\n", text)
    sentences = text.split("\n")
    paras = []
    cur = []
    for sent in sentences:
        sent = sent.strip()
        if not sent:
            continue
        cur.append(sent)
        if len(" ".join(cur)) > 220:
            paras.append(" ".join(cur))
            cur = []
    if cur:
        paras.append(" ".join(cur))
    paras = [p for p in paras if len(p) > 30][:18]
    content = "\n".join(f"<p>{html.escape(p)}</p>" for p in paras)
    return content, cover


def render_listing(posts: list[BlogPost], nested: bool = False) -> str:
    prefix = "../" if nested else ""
    cards = "\n".join(f'''<article class="post-card"><a href="{prefix}blog/{p.slug}.html"><img src="{html.escape(p.cover or 'https://intm.kr/images/portfolio/ad270e74-a62c-4f19-a25a-c9e0eb91cf34/0bc5f79c-ab61-4780-ab73-6939c7454ec8.webp')}" alt="{html.escape(p.title)}"></a><div><span class="cat">{html.escape(p.category)}</span><h2><a href="{prefix}blog/{p.slug}.html">{html.escape(p.title)}</a></h2><p>{html.escape(p.excerpt)}</p><div class="meta"><span>{p.date}</span><span>{' · '.join(html.escape(t) for t in p.tags[:3])}</span></div></div></article>''' for p in posts)
    return page_shell("공간보감 블로그 | 부산 인테리어 이야기", "부산 아파트 인테리어, 견적, 시공 과정, 포트폴리오를 공간보감 블로그에서 확인하세요.", f'''<section class="hero"><div class="wrap"><div class="eyebrow">GONGBANG BLOG</div><h1>공간보감 블로그</h1><p>네이버 블로그에 쌓아온 상담 기록과 현장 이야기를 홈페이지용으로 다시 정리합니다. 견적, 공사 과정, 지역별 사례를 차분히 볼 수 있습니다.</p><div class="actions"><a class="btn dark" href="https://intm.kr/consultation/ggbg">상담 신청</a><a class="btn" href="{NAVER_BLOG}" target="_blank" rel="noopener">네이버 블로그</a><a class="btn" href="{INSTAGRAM}" target="_blank" rel="noopener">Instagram</a></div></div></section><section><div class="wrap"><div class="toolbar"><a href="#all">전체</a><a href="#estimate">견적·상담</a><a href="#area">지역 사례</a><a href="{prefix}feed.xml">RSS</a></div><div class="posts">{cards}</div></div></section>''', canonical=("blog/" if nested else "blog.html"), prefix=prefix)


def render_post(p: BlogPost) -> str:
    tag_html = "".join(f"<span>{html.escape(t)}</span>" for t in p.tags)
    cover = f'<img class="cover" src="{html.escape(p.cover)}" alt="{html.escape(p.title)}">' if p.cover else ""
    body = f'''<section class="post-hero"><div class="wrap"><a class="back" href="../blog.html">← 블로그 목록</a><div class="eyebrow">{html.escape(p.category)}</div><h1>{html.escape(p.title)}</h1><p>{html.escape(p.excerpt)}</p><div class="meta"><span>{p.date}</span><a href="{html.escape(p.source)}" target="_blank" rel="noopener">네이버 원문</a></div><div class="tags">{tag_html}</div></div></section><section><div class="wrap article">{cover}<div class="notice">이 글은 네이버 블로그 원문을 홈페이지 독자가 읽기 쉽도록 문단과 검색 문맥을 정리한 이전본입니다. 원문은 하단 링크에서 확인할 수 있습니다.</div>{p.html}<div class="source-box"><b>원문 보기</b><p>네이버 블로그 원문과 댓글, 이웃 반응은 아래 링크에서 확인할 수 있습니다.</p><a class="btn dark" href="{html.escape(p.source)}" target="_blank" rel="noopener">네이버 원문 열기</a><a class="btn" href="https://intm.kr/consultation/ggbg">상담 신청</a></div></div></section>'''
    return page_shell(p.title + " | 공간보감 블로그", p.excerpt, body, canonical=f"blog/{p.slug}.html", prefix="../", article=p)


def page_shell(title: str, description: str, main: str, canonical: str, prefix: str = "", article: BlogPost | None = None) -> str:
    article_schema = ""
    if article:
        article_schema = f'''<script type="application/ld+json">{json.dumps({"@context":"https://schema.org","@type":"BlogPosting","headline":article.title,"datePublished":article.date,"dateModified":article.date,"image":article.cover,"author":{"@type":"Person","name":"백창석"},"publisher":{"@type":"LocalBusiness","name":"공간보감","url":SITE_URL},"mainEntityOfPage":SITE_URL+"/"+canonical,"description":article.excerpt}, ensure_ascii=False)}</script>'''
    return f'''<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>{html.escape(title)}</title><meta name="description" content="{html.escape(description[:155])}"><meta name="robots" content="index,follow,max-image-preview:large,max-snippet:-1"><link rel="canonical" href="{SITE_URL}/{canonical}"><meta property="og:type" content="{'article' if article else 'website'}"><meta property="og:locale" content="ko_KR"><meta property="og:site_name" content="공간보감"><meta property="og:title" content="{html.escape(title)}"><meta property="og:description" content="{html.escape(description[:180])}"><meta property="og:url" content="{SITE_URL}/{canonical}"><meta property="og:image" content="{html.escape((article.cover if article else '') or 'https://intm.kr/images/portfolio/ad270e74-a62c-4f19-a25a-c9e0eb91cf34/0bc5f79c-ab61-4780-ab73-6939c7454ec8.webp')}">{article_schema}<style>:root{{--ink:#24211f;--soft:#756f68;--bg:#fff;--paper:#fbfaf8;--line:#e8e1d8;--brown:#7a604b;--deep:#171411;--max:1120px;--shadow:0 18px 54px rgba(45,32,20,.08)}}*{{box-sizing:border-box}}body{{margin:0;background:var(--bg);color:var(--ink);font-family:-apple-system,BlinkMacSystemFont,"Pretendard","Noto Sans KR",sans-serif;line-height:1.75;letter-spacing:-.018em}}a{{text-decoration:none;color:inherit}}.wrap{{width:min(var(--max),calc(100% - 44px));margin:auto}}.top{{position:sticky;top:0;z-index:20;background:rgba(255,255,255,.94);backdrop-filter:blur(16px);border-bottom:1px solid var(--line)}}.top .wrap{{min-height:72px;display:flex;align-items:center;justify-content:space-between;gap:20px}}.brand{{font-size:23px;font-weight:620}}.nav{{display:flex;gap:16px;flex-wrap:wrap;color:#403933;font-size:14px}}.cta{{background:var(--deep);color:#fff;border-radius:999px;padding:10px 15px;white-space:nowrap}}.hero,.post-hero{{padding:82px 0 54px;border-bottom:1px solid var(--line)}}.eyebrow{{font-size:12px;color:var(--brown);letter-spacing:.15em;text-transform:uppercase;margin-bottom:14px}}h1{{font-size:clamp(36px,5vw,64px);line-height:1.1;letter-spacing:-.045em;font-weight:520;margin:0 0 18px}}.hero p,.post-hero p{{font-size:20px;color:var(--soft);max-width:820px;word-break:keep-all}}.actions,.meta,.tags,.toolbar{{display:flex;gap:10px;flex-wrap:wrap;align-items:center}}.btn,.toolbar a{{display:inline-flex;align-items:center;justify-content:center;border:1px solid var(--line);border-radius:999px;padding:10px 15px;background:#fff;font-weight:520}}.btn.dark{{background:var(--deep);border-color:var(--deep);color:#fff}}section{{padding:58px 0;border-bottom:1px solid var(--line)}}.posts{{display:grid;gap:18px}}.post-card{{display:grid;grid-template-columns:280px 1fr;gap:24px;border:1px solid var(--line);background:var(--paper);border-radius:28px;padding:18px;box-shadow:0 12px 32px rgba(45,32,20,.045)}}.post-card img{{width:100%;height:190px;object-fit:cover;border-radius:20px;background:#ddd}}.post-card h2{{font-size:27px;line-height:1.25;letter-spacing:-.035em;margin:7px 0 9px;font-weight:560}}.post-card p{{margin:0;color:var(--soft);word-break:keep-all}}.cat{{font-size:12px;color:var(--brown);letter-spacing:.08em}}.meta{{font-size:13px;color:var(--soft);margin-top:12px}}.back{{color:var(--brown);font-size:14px}}.tags span{{border:1px solid var(--line);border-radius:999px;padding:6px 9px;background:#fff;font-size:12px;color:#514a42}}.article{{max-width:860px}}.cover{{width:100%;max-height:520px;object-fit:cover;border-radius:30px;margin-bottom:28px;box-shadow:var(--shadow)}}.article p{{font-size:18px;color:#3f3933;word-break:keep-all;margin:0 0 20px}}.notice,.source-box{{background:var(--paper);border:1px solid var(--line);border-radius:22px;padding:20px;margin:22px 0;color:var(--soft)}}.source-box b{{color:var(--ink)}}footer{{background:#8a8178;color:#fff;padding:38px 0}}footer a{{text-decoration:underline}}@media(max-width:760px){{.top .wrap{{min-height:58px;gap:10px}}.brand{{font-size:20px}}.nav{{flex:1;overflow-x:auto;flex-wrap:nowrap;gap:14px;white-space:nowrap}}.cta{{font-size:12px;padding:8px 12px}}.post-card{{grid-template-columns:1fr}}.post-card img{{height:auto;aspect-ratio:16/10}}.wrap{{width:min(var(--max),calc(100% - 28px))}}section{{padding:44px 0}}}}</style></head><body><header class="top"><div class="wrap"><a class="brand" href="{prefix}index.html">공간보감</a><nav class="nav"><a href="{prefix}index.html">메인</a><a href="{prefix}portfolio.html">포트폴리오</a><a href="{prefix}blog.html">블로그</a><a href="{prefix}estimate.html">견적준비</a><a href="{NAVER_BLOG}" target="_blank" rel="noopener">네이버 블로그</a><a href="{INSTAGRAM}" target="_blank" rel="noopener">Instagram</a></nav><a class="cta" href="https://intm.kr/consultation/ggbg">상담 신청</a></div></header><main>{main}</main><footer><div class="wrap">공간보감 · 부산 인테리어 상담 · <a href="{NAVER_BLOG}" target="_blank" rel="noopener">네이버 블로그</a> · <a href="{INSTAGRAM}" target="_blank" rel="noopener">Instagram</a></div></footer></body></html>'''


def load_rss() -> list[dict]:
    rss_path = ROOT / "data" / "blog" / "source-rss.xml"
    rss_path.parent.mkdir(parents=True, exist_ok=True)
    run(["curl", "-L", "-s", RSS_URL, "-o", str(rss_path)], timeout=60)
    root = ET.fromstring(rss_path.read_text(encoding="utf-8", errors="ignore"))
    items = []
    for item in root.findall(".//item"):
        title = clean_text(item.findtext("title") or "")
        link = item.findtext("link") or ""
        desc = item.findtext("description") or ""
        pub = item.findtext("pubDate") or ""
        items.append({"title": title, "link": link, "description": desc, "pubDate": pub})
    return items


def import_posts(limit: int = 50) -> list[BlogPost]:
    items = load_rss()[:limit]
    raw_dir = ROOT / "data" / "blog" / "raw"
    raw_dir.mkdir(parents=True, exist_ok=True)
    posts: list[BlogPost] = []
    for i, item in enumerate(items, 1):
        title = item["title"]
        link = item["link"].split("?")[0]
        slug = slugify(title, link)
        log = re.search(r"/(\d+)", link)
        logno = log.group(1) if log else ""
        view_url = f"https://blog.naver.com/PostView.naver?blogId={BLOG_ID}&logNo={logno}&redirect=Dlog&widgetTypeCall=true&directAccess=false" if logno else link
        raw_path = raw_dir / f"{slug}.html"
        if not raw_path.exists() or raw_path.stat().st_size < 5000:
            print(f"[{i}/{len(items)}] fetch {title}")
            try:
                fetch_url(view_url, raw_path)
            except Exception as e:
                print("  fetch failed", e)
                raw_path.write_text("", encoding="utf-8")
        raw = raw_path.read_text(encoding="utf-8", errors="ignore")
        body, cover = extract_post_html(raw, item["description"])
        desc = clean_text(item["description"])
        excerpt = desc[:180].rstrip() + ("…" if len(desc) > 180 else "")
        try:
            date = parsedate_to_datetime(item["pubDate"]).strftime("%Y-%m-%d")
        except Exception:
            date = "2026-01-01"
        category = category_for(title, desc)
        tags = tags_for(title, desc)
        posts.append(BlogPost(slug, title, date, category, tags, excerpt, cover, link, body))
    return posts


def write_outputs(posts: list[BlogPost]) -> None:
    data_dir = ROOT / "data" / "blog"
    blog_dir = ROOT / "blog"
    blog_dir.mkdir(exist_ok=True)
    (data_dir / "posts.json").write_text(json.dumps([asdict(p) for p in posts], ensure_ascii=False, indent=2), encoding="utf-8")
    (ROOT / "blog.html").write_text(render_listing(posts), encoding="utf-8")
    (blog_dir / "index.html").write_text(render_listing(posts, nested=True), encoding="utf-8")
    for p in posts:
        (blog_dir / f"{p.slug}.html").write_text(render_post(p), encoding="utf-8")
    feed_items = "\n".join(f"""<item><title>{html.escape(p.title)}</title><link>{SITE_URL}/blog/{p.slug}.html</link><guid>{SITE_URL}/blog/{p.slug}.html</guid><pubDate>{p.date}</pubDate><description>{html.escape(p.excerpt)}</description></item>""" for p in posts)
    (ROOT / "feed.xml").write_text(f"""<?xml version=\"1.0\" encoding=\"UTF-8\"?><rss version=\"2.0\"><channel><title>공간보감 블로그</title><link>{SITE_URL}/blog.html</link><description>부산 인테리어와 리모델링 이야기</description>{feed_items}</channel></rss>""", encoding="utf-8")
    update_sitemap(posts)


def update_sitemap(posts: list[BlogPost]) -> None:
    sitemap = ROOT / "sitemap.xml"
    urls = []
    if sitemap.exists():
        s = sitemap.read_text(encoding="utf-8", errors="ignore")
        urls = re.findall(r"<loc>(.*?)</loc>", s)
    base_urls = [u for u in urls if "/blog/" not in u and not u.endswith("/blog.html") and not u.endswith("/feed.xml")]
    add = [f"{SITE_URL}/blog.html", f"{SITE_URL}/blog/", f"{SITE_URL}/feed.xml"] + [f"{SITE_URL}/blog/{p.slug}.html" for p in posts]
    all_urls = []
    for u in base_urls + add:
        if u not in all_urls:
            all_urls.append(u)
    body = "\n".join(f"  <url><loc>{html.escape(u)}</loc><priority>{'0.9' if u.endswith('blog.html') or u.endswith('/blog/') else '0.7'}</priority></url>" for u in all_urls)
    sitemap.write_text(f"<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<urlset xmlns=\"http://www.sitemaps.org/schemas/sitemap/0.9\">\n{body}\n</urlset>\n", encoding="utf-8")


def main() -> None:
    limit = int(sys.argv[1]) if len(sys.argv) > 1 else 50
    posts = import_posts(limit)
    write_outputs(posts)
    print(f"imported {len(posts)} posts")

if __name__ == "__main__":
    main()
