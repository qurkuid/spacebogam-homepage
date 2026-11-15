"""Public company details shared by generated pages and the footer refresh."""
import re

BUSINESS_INFO = '<p data-business-info="spacebogam"><strong>공간보감</strong><br>상호 공간보감 인테리어 디자인 · 대표 백창석<br>사업자등록번호 625-43-01028<br>실내건축공사업 등록번호 부산진2022-02-07<br>부산광역시 해운대구 좌동순환로 457, 402호<br>대표 전화 <a href="tel:050713881252">1551-0163</a></p>'
FOOTER_LINKS = '<a href="/contact.html">오시는 길·주차 안내</a><a href="/sns/">SNS</a><a href="/overview.html">회사소개</a><a href="/privacy/">개인정보처리방침</a>'
FOOTER_STYLE = '<link rel="stylesheet" href="/assets/business-info.css?v=footer-sns-20261104" data-business-info-style="spacebogam">'


def footer_html(previous=''):
    links = FOOTER_LINKS
    seen = set(re.findall(r'href="([^"]+)"', BUSINESS_INFO + links))
    for anchor in re.findall(r'<a\b[^>]*>.*?</a>', previous, re.S):
        href = re.search(r'href=["\']([^"\']+)', anchor)
        if href and href[1] not in seen:
            links += anchor
            seen.add(href[1])
    return '<footer class="v8-footer site-footer" data-site-footer="spacebogam">' + BUSINESS_INFO + '<nav aria-label="하단 메뉴">' + links + '</nav></footer>'


def refresh_footer(source):
    if re.search(r'<meta\b[^>]*content=["\'][^"\']*noindex', source, re.I):
        return source
    if '<footer' in source:
        source = re.sub(r'<footer\b[^>]*>.*?</footer>', lambda m: footer_html(m[0]), source, flags=re.S)
    elif '<main' in source and '</body>' in source:
        source = source.replace('</body>', footer_html() + '\n</body>')
    else:
        return source
    source = re.sub(r'<link\b[^>]*href=["\'][^"\']*assets/business-info\.css[^>]*>', '', source)
    return source.replace('</head>', FOOTER_STYLE + '</head>')
