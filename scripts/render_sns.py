"""Render the SNS landing page from the existing imported blog records."""
import html
import json
from pathlib import Path
from scripts.site_footer import footer_html, FOOTER_STYLE


def render_sns(posts):
    cards = []
    for post in sorted(posts, key=lambda p: p['date'], reverse=True)[:6]:
        excerpt = post['excerpt']
        if excerpt.startswith(post['title']):
            excerpt = excerpt[len(post['title']):].strip()
        cards.append(f'''<a class="sns-card" href="{html.escape(post['source'], quote=True)}" target="_blank" rel="noopener noreferrer"><img src="{html.escape(post['cover'], quote=True)}" alt="{html.escape(post['title'], quote=True)}" loading="lazy" width="640" height="480"><h3>{html.escape(post['title'])}</h3><p>{html.escape(excerpt)}</p><time datetime="{post['date']}">{post['date']}</time><p class="sns-open">네이버 블로그에서 이어 읽기 ↗</p></a>''')
    return f'''<!doctype html>
<html lang="ko"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>SNS · 인스타그램과 블로그 | 공간보감</title>
<meta name="description" content="공간보감 인스타그램의 현장 사진과 네이버 블로그의 상담·시공 이야기. 사진과 글을 미리 보고 원문에서 이어 확인하세요.">
<meta name="robots" content="index,follow,max-image-preview:large">
<link rel="canonical" href="https://spacebogam.kr/sns/">
<meta property="og:type" content="website"><meta property="og:locale" content="ko_KR"><meta property="og:site_name" content="공간보감"><meta property="og:title" content="SNS · 인스타그램과 블로그 | 공간보감"><meta property="og:url" content="https://spacebogam.kr/sns/">
<meta property="og:description" content="현장 사진과 상담·시공 이야기를 원문에서 이어 확인하세요.">
<meta property="og:image" content="https://spacebogam.kr/assets/portfolio/mega-centum-49py.jpg">
<link rel="icon" href="/assets/favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="/assets/preview-v8.css?v=cmp1192-webp"><link rel="stylesheet" href="/assets/sns.css?v=footer-sns-20261104">
<link rel="stylesheet" href="/assets/site-navigation.css?v=c1da07ddb452">{FOOTER_STYLE}
<script defer src="/assets/site-navigation.js?v=footer-sns-20261104"></script><script defer src="/assets/sns.js?v=footer-sns-20261104"></script>
</head><body>
<a class="v8-skip" href="#main-content">본문 바로가기</a>
<header class="v8-header"><a class="v8-brand" href="/">공간보감</a><nav aria-label="주요 메뉴"><a href="/portfolio.html">포트폴리오</a><a href="/insights/">시공 이야기</a><a href="/sns/" aria-current="page">SNS</a></nav><a class="v8-consult" href="/consultation/">상담 신청</a></header>
<main id="main-content" class="sns-page">
<section class="sns-intro"><p class="sns-eyebrow">SOCIAL · 공간보감의 기록</p><h1>사진으로 보고,<br>이야기로 이해하는 공간.</h1><p>인스타그램에는 현장의 장면을, 블로그에는 그 공간을 만든 과정과 생각을 담습니다. 마음에 드는 사진과 글을 누르면 원문으로 이어집니다.</p><a href="#instagram">인스타그램</a> · <a href="#blog">네이버 블로그</a></section>
<section id="instagram" class="sns-section" aria-labelledby="instagram-title"><div class="sns-section-head"><div><p class="sns-eyebrow">INSTAGRAM</p><h2 id="instagram-title">현장의 장면들</h2></div><a href="https://www.instagram.com/ggbg.official/" target="_blank" rel="noopener noreferrer">@ggbg.official ↗</a></div><p id="instagram-status" role="status">인스타그램 소식을 불러오고 있습니다.</p><div id="instagram-posts" class="sns-grid"></div><noscript><p><a href="https://www.instagram.com/ggbg.official/" target="_blank" rel="noopener noreferrer">공간보감 인스타그램 사진 보기 ↗</a></p></noscript></section>
<section id="blog" class="sns-section" aria-labelledby="blog-title"><div class="sns-section-head"><div><p class="sns-eyebrow">NAVER BLOG</p><h2 id="blog-title">공간을 만든 이야기</h2></div><a href="https://blog.naver.com/baek1985" target="_blank" rel="noopener noreferrer">블로그 전체 글 보기 ↗</a></div><p>블로그에서 가져온 글 일부입니다. 전체 사진과 본문은 네이버 블로그에서 이어 읽을 수 있습니다.</p><div class="sns-grid">{''.join(cards)}</div></section>
</main>{footer_html()}</body></html>'''


if __name__ == '__main__':
    root = Path(__file__).resolve().parents[1]
    target = root / 'sns/index.html'
    target.parent.mkdir(exist_ok=True)
    target.write_text(render_sns(json.loads((root / 'data/blog/posts.json').read_text())), encoding='utf-8')
