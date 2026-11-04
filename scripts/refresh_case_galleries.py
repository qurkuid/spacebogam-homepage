"""Rebuild the public case galleries using the existing portfolio card metadata."""
from __future__ import annotations

import hashlib
import json
import re
from html import escape
from pathlib import Path
from urllib.parse import urlsplit

from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parents[1]


def asset_path(value):
    parsed = urlsplit(value)
    if parsed.netloc or not parsed.path.startswith(('/assets/', 'assets/')) or '..' in parsed.path.split('/'):
        raise ValueError(f'Expected a local photo asset: {value}')
    return '/' + parsed.path.lstrip('/')


def photo_key(value):
    return asset_path(value).replace('-thumb.', '.')


def photo(img):
    anchor = img.find_parent('a')
    href = anchor.get('href', '') if anchor else ''
    if not re.search(r'\.(webp|jpe?g|png)(?:\?|$)', href, re.I):
        href = img['src']
    figure = img.find_parent('figure')
    caption = figure.find('figcaption') if figure else None
    return dict(href=asset_path(href), src=asset_path(img['src']), alt=img.get('alt', ''),
                width=img.get('width'), height=img.get('height'),
                caption=caption.get_text(' ', strip=True) if caption else '')


def extract_photos(soup):
    images = soup.select('[data-gallery-image] img')
    if not images:
        images = soup.select('.project .photo img, .case-gallery img')
    if not images:
        images = soup.select('main img')  # The existing Hwamyeong landing has no .case-gallery.
    out = {}
    for img in images:
        item = photo(img)
        out.setdefault(photo_key(item['href']), item)
    if not out:
        raise ValueError('Case page has no photos')
    return list(out.values())


def image_html(item, eager=False):
    attrs = {key: item[key] for key in ('src', 'alt', 'width', 'height') if item.get(key)}
    attrs.update(loading='eager' if eager else 'lazy', decoding='async')
    if eager:
        attrs['fetchpriority'] = 'high'
    return '<img ' + ' '.join(f'{key}="{escape(str(value), quote=True)}"' for key, value in attrs.items()) + '>'


def figure_html(item, eager=False):
    caption = f'<figcaption>{escape(item["caption"])}</figcaption>' if item['caption'] else ''
    return (f'<figure><a data-gallery-image href="{escape(item["href"], quote=True)}" target="_blank" rel="noopener">'
            f'{image_html(item, eager)}</a>{caption}</figure>')


def before_after_html(soup):
    section = soup.select_one('#before-after')
    if not section:
        return ''
    pairs = section.select('.pd-pair, figure.card')
    rendered = []
    for pair in pairs:
        images = pair.select('img')
        if len(images) != 2:
            raise ValueError('Expected a before/after photo pair')
        title = escape(pair.find('h3').get_text(' ', strip=True))
        pictures = ''.join(f'<figure><a href="{escape(photo(img)["href"], quote=True)}" target="_blank" rel="noopener">'
                           f'{image_html(photo(img))}</a><figcaption>{label}</figcaption></figure>'
                           for img, label in zip(images, ['시공 전', '시공 후']))
        rendered.append(f'<article class="pd-pair"><h3>{title}</h3><div>{pictures}</div></article>')
    return ('<section class="pd-section" id="before-after" aria-labelledby="before-after-title">'
            '<div class="pd-section-heading"><h2 id="before-after-title">시공 전·후</h2>'
            '<p>촬영 위치와 각도는 서로 다릅니다.</p></div><div class="pd-pairs">' + ''.join(rendered) + '</div></section>')


def scope_html(card):
    confirmed = [part for part in card.select_one('.pf-scope').get_text(strip=True).split(' · ') if '문의' not in part]
    fields = []
    for label in ('샤시', '시스템에어컨', '확장'):
        text = next((part.removeprefix(label).strip() for part in confirmed if part.startswith(label)), '')
        value = text if text == '포함' else (text + ' 포함' if text else '포함 여부 문의')
        fields.append(f'<div><dt>{label}</dt><dd>{escape(value)}</dd></div>')
    return ''.join(fields)


def version(path):
    return path + '?v=' + hashlib.sha256((ROOT / path).read_bytes()).hexdigest()[:12]


def render_page(source, card, portfolio):
    soup = BeautifulSoup(source, 'html.parser')
    photos = extract_photos(soup)
    cover_key = photo_key(card.find('img')['src'])
    cover = next((item for item in photos if photo_key(item['href']) == cover_key), photos[0])
    photos = [cover] + [item for item in photos if item is not cover]
    title = card.find('h2').get_text(strip=True)
    meta = re.sub(r' · 사진 \d+장$', '', card.find('p').get_text(strip=True))
    budget = card.select_one('.pf-budget').get_text(strip=True)
    tags = [tag for tag in card.get('data-tags', '').split('|') if tag and tag not in ('샤시', '시스템에어컨', '확장')]
    lead = soup.select_one('.pd-intro .pd-description, .hero .lead')
    description = lead.get_text(' ', strip=True).split('. ')[0].rstrip('.') + '.' if lead else f'{meta} 아파트의 거실과 주방, 현관과 침실을 담았습니다.'
    comparisons = before_after_html(soup)
    head = soup.head
    for tag in head.select('link[rel="stylesheet"], style'):
        tag.decompose()
    for tag in head.select('meta[name="description"], meta[property="og:description"], meta[name="twitter:description"]'):
        tag['content'] = description
    def update_schema(value):
        if isinstance(value, list):
            return [update_schema(item) for item in value if not isinstance(item, dict) or item.get('@type') != 'FAQPage']
        if not isinstance(value, dict):
            return value
        if value.get('@type') in ('CreativeWork', 'Article'):
            value.pop('hasPart', None)
            value.pop('citation', None)
            value.update(description=description, dateModified='2026-11-04', image='https://spacebogam.kr' + cover['href'])
        return {key: update_schema(item) for key, item in value.items()}

    for tag in head.select('script[type="application/ld+json"]'):
        value = json.loads(tag.string)
        if isinstance(value, dict) and value.get('@type') == 'FAQPage':
            tag.decompose()
        else:
            tag.string = json.dumps(update_schema(value), ensure_ascii=False, separators=(',', ':'))
    for tag in head.select('script[src]'):
        src = tag['src']
        if 'site-navigation.js' in src:
            tag['src'] = '/' + version('assets/site-navigation.js')
        if 'lightbox.js' in src:
            tag.decompose()
    for path in ('assets/preview-v8.css', 'assets/site-navigation.css', 'assets/residential-entry.css', 'assets/case-gallery.css'):
        head.append(soup.new_tag('link', rel='stylesheet', href='/' + version(path)))
    head.append(soup.new_tag('script', src='/' + version('assets/lightbox.js'), defer=''))
    for whitespace in head.find_all(string=True, recursive=False):
        if not whitespace.strip():
            whitespace.extract()
    before_link = '<a href="#before-after">시공 전·후</a>' if comparisons else ''
    tag_list = ''.join(f'<li>#{escape(tag)}</li>' for tag in tags)
    gallery = '\n'.join(figure_html(item) for item in photos[1:])
    main = f'''<main class="pd-main" id="main-content">
<header class="pd-intro"><a class="pd-back" href="/portfolio.html#project-list">← 포트폴리오</a>
<h1>{escape(title)}</h1><p class="pd-description">{escape(description)}</p>
<nav class="pd-sections" aria-label="현장 페이지 구성"><a href="#case-photos">사진 갤러리 <span>{len(photos)}</span></a><a href="#project-info">현장 정보</a>{before_link}</nav></header>
<div class="pd-overview"><div class="pd-cover">{figure_html(cover, eager=True)}</div>
<section class="pd-info" id="project-info" aria-labelledby="project-info-title"><p class="pd-section-label">01 / PROJECT</p><h2 id="project-info-title">현장 정보</h2>
<p class="pd-meta">{escape(meta)}</p><dl class="pd-budget"><dt>공개 금액대</dt><dd>{escape(budget)}</dd></dl>
<div class="pd-info-group"><h3>공사 범위</h3><dl class="pd-scope">{scope_html(card)}</dl></div>
<div class="pd-info-group"><h3>디자인·생활 태그</h3><ul class="pd-tags">{tag_list}</ul></div></section></div>
<section class="pd-section" id="case-photos" aria-labelledby="case-photos-title"><div class="pd-section-heading"><div><p class="pd-section-label">02 / GALLERY</p><h2 id="case-photos-title">완성 사진</h2></div><p class="pd-photo-count">전체 {len(photos)}장</p></div>
<div class="case-gallery">{gallery}</div></section>{comparisons}
<section class="pd-contact" aria-labelledby="case-contact-title"><div><p class="pd-section-label">CONSULTATION</p><h2 id="case-contact-title">이 현장으로 상담하기</h2></div><a class="sb-entry-primary" data-v8-event="case_consult_click" data-cta-location="case_gallery_bottom" href="/consultation/?type=residential">상담 신청 ↗</a><a class="pd-back" href="/portfolio.html#project-list">전체 포트폴리오</a></section>
</main>'''
    portfolio_body = str(portfolio.body)
    prefix = portfolio_body[portfolio_body.index('>') + 1:portfolio_body.index('<main')]
    suffix = portfolio_body[portfolio_body.index('<footer'):portfolio_body.rfind('</body>')]
    prefix = prefix.replace('portfolio_consult_click', 'case_consult_click')
    suffix = suffix.replace('portfolio_consult_click', 'case_consult_click').replace('portfolio_mobile_', 'case_mobile_')
    return ('<!DOCTYPE html><html lang="ko">' + str(head) + '\n'
            '<body class="pd-page" data-no-auto-cta="true" data-sb-consult-entry="residential">' + prefix + main + suffix + '</body></html>\n')


def main():
    portfolio = BeautifulSoup((ROOT / 'portfolio.html').read_text(encoding='utf-8'), 'html.parser')
    for card in portfolio.select('.v8-grid > article'):
        path = ROOT / card.select_one('a[data-project]')['href']
        path.write_text(render_page(path.read_text(encoding='utf-8'), card, portfolio), encoding='utf-8')


if __name__ == '__main__':
    main()
