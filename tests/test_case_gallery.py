import unittest
import json
import hashlib
import xml.etree.ElementTree as ET
from pathlib import Path

from bs4 import BeautifulSoup
from scripts.refresh_case_galleries import extract_photos, photo_key, render_page


ROOT = Path(__file__).resolve().parents[1]
COUNTS = {
    'mega-centum-49py': 76, 'sajik-32py': 55, 'sajik-ssangyong': 8,
    'geoje-yurim-asiad-47py': 130, 'hwamyeong-kolong': 35,
    'guseo-ssangyong-sweetdot-home': 162, 'sajik-lottecastle-the-classic': 15,
    'hwamyeong-lottecastle': 32, 'guseo-ssangyong': 30, 'oryukdo-sk-view': 27,
    'samhan-goldenview': 19, 'geoje-hyundai-hometown': 17,
    'daewoo-ian-35py': 48, 'namcheon-exllu-56py': 12, 'yeonji-yurim-30py': 12,
}


class CasePhotosTest(unittest.TestCase):
    def test_all_live_photos_survive_extraction(self):
        portfolio = BeautifulSoup((ROOT / 'portfolio.html').read_text(encoding='utf-8'), 'html.parser')
        total = 0
        for link in portfolio.select('.v8-grid a[data-project]'):
            with self.subTest(project=link['data-project']):
                soup = BeautifulSoup((ROOT / link['href']).read_text(encoding='utf-8'), 'html.parser')
                photos = extract_photos(soup)
                self.assertEqual(len(photos), COUNTS[link['data-project']])
                self.assertEqual(len({photo_key(item['href']) for item in photos}), len(photos))
                self.assertTrue(all(item['alt'] for item in photos))
                total += len(photos)
        self.assertEqual(total, 678)

    def test_layout_metadata_assets_and_repeatability(self):
        portfolio = BeautifulSoup((ROOT / 'portfolio.html').read_text(encoding='utf-8'), 'html.parser')
        for card in portfolio.select('.v8-grid > article'):
            page = card.select_one('a[data-project]')['href']
            with self.subTest(page=page):
                source = (ROOT / page).read_text(encoding='utf-8')
                soup = BeautifulSoup(source, 'html.parser')
                self.assertEqual(len(soup.select('h1')), 1)
                self.assertEqual(soup.select_one('h1').text, card.select_one('h2').text)
                self.assertEqual(soup.select_one('.pd-budget dd').text, card.select_one('.pf-budget').text)
                self.assertEqual([x.text for x in soup.select('.pd-scope dt')], ['샤시', '시스템에어컨', '확장'])
                self.assertEqual({x.text for x in soup.select('.pd-tags li')}, {x.text for x in card.select('.pf-card-tags span')})
                self.assertEqual(soup.select_one('link[rel="canonical"]')['href'], 'https://spacebogam.kr/' + page)
                self.assertEqual(soup.select_one('#case-photos-title').text, '완성 사진')
                self.assertFalse(soup.select('.portfolio-story, .sb-case-scenes, .faq'))
                self.assertFalse([x for x in soup.select('main a') if x.get('href', '').startswith('http')])
                def check_schema(value):
                    if isinstance(value, list):
                        for item in value:
                            check_schema(item)
                    if isinstance(value, dict):
                        self.assertNotEqual(value.get('@type'), 'FAQPage')
                        self.assertNotIn('hasPart', value)
                        self.assertNotIn('citation', value)
                        for item in value.values():
                            check_schema(item)
                for script in soup.select('script[type="application/ld+json"]'):
                    check_schema(json.loads(script.string))
                for image in soup.select('main img'):
                    self.assertTrue((ROOT / image['src'].lstrip('/')).is_file(), image['src'])
                    self.assertTrue((ROOT / image.parent['href'].lstrip('/')).is_file(), image.parent['href'])
                for asset in soup.select('link[rel="stylesheet"], script[src]'):
                    url = asset.get('href', asset.get('src', ''))
                    if '?v=' in url and url.split('?')[0].lstrip('/') in ['assets/case-gallery.css', 'assets/lightbox.js', 'assets/preview-v8.css', 'assets/site-navigation.css', 'assets/site-navigation.js', 'assets/residential-entry.css']:
                        name, version = url.lstrip('/').split('?v=')
                        self.assertEqual(hashlib.sha256((ROOT / name).read_bytes()).hexdigest()[:12], version)
                self.assertEqual(render_page(source, card, portfolio), source)
                for marker in ['GTM-PW8GLP8S', 'G-EJGXDD5C1T', '/consultation/?type=residential']:
                    self.assertIn(marker, source)

    def test_confirmed_and_unknown_scope(self):
        mega = BeautifulSoup((ROOT / 'case-mega-centum-49py.html').read_text(), 'html.parser')
        self.assertEqual([x.text for x in mega.select('.pd-scope dd')], ['포함', '4대 포함', '6개 포함'])
        samhan = BeautifulSoup((ROOT / 'case-samhan-goldenview.html').read_text(), 'html.parser')
        self.assertEqual(samhan.select_one('.pd-budget dd').text, '금액대 별도 문의')
        self.assertEqual([x.text for x in samhan.select('.pd-scope dd')], ['포함 여부 문의'] * 3)

    def test_before_after_stays_separate_from_completed_gallery(self):
        soup = BeautifulSoup((ROOT / 'case-yeonji-yurim-norwegian-forest.html').read_text(), 'html.parser')
        self.assertEqual(len(soup.select('#before-after .pd-pair')), 4)
        self.assertEqual([x.text for x in soup.select('#before-after figcaption')], ['시공 전', '시공 후'] * 4)
        self.assertEqual(len(soup.select('[data-gallery-image]')), 12)

    def test_sitemap_includes_all_cases_with_current_dates(self):
        sitemap = ET.parse(ROOT / 'sitemap.xml')
        ns = {'s': 'http://www.sitemaps.org/schemas/sitemap/0.9'}
        entries = {x.find('s:loc', ns).text: x for x in sitemap.findall('s:url', ns)}
        portfolio = BeautifulSoup((ROOT / 'portfolio.html').read_text(), 'html.parser')
        for link in portfolio.select('.v8-grid a[data-project]'):
            self.assertEqual(entries['https://spacebogam.kr/' + link['href']].find('s:lastmod', ns).text, '2026-11-04')

    def test_hwamyeong_keeps_privacy_masked_photos(self):
        soup = BeautifulSoup((ROOT / 'case-hwamyeong-kolong.html').read_text(encoding='utf-8'), 'html.parser')
        photos = extract_photos(soup)
        paths = {item['src'] for item in photos}
        for number in [2, 29, 31, 36]:
            self.assertIn(f'/assets/case/hwamyeong-landing/photo-{number}-privacy.webp', paths)


if __name__ == '__main__':
    unittest.main()
