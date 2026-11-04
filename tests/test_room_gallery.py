import json
import unittest
from bs4 import BeautifulSoup
from scripts.refresh_case_galleries import ROOT, PREVIEWS, ROOMS, ROOM_ORDER, extract_photos, refresh_portfolio


class RoomGalleryTest(unittest.TestCase):
    def test_reviewed_room_boundaries(self):
        expected = {
            'case-hwamyeong-kolong.html': {3: '주방', 5: '현관·복도', 11: '주방', 13: '주방', 34: '주방'},
            'case-geoje-yurim-asiad-47py.html': {23: '현관·복도', 28: '현관·복도'},
            'case-sajik-ssangyong.html': {1: '현관·복도', 3: '거실'},
            'case-sajik-lottecastle-the-classic.html': {14: '거실'},
            'case-namcheon-exllu-56py.html': {8: '주방', 9: '주방'},
        }
        for page, labels in expected.items():
            photos = extract_photos(BeautifulSoup((ROOT / page).read_text(), 'html.parser'))
            for number, room in labels.items():
                self.assertEqual(ROOMS[photos[number - 1]['href']], room, f'{page} photo {number}')

    def test_complete_room_mapping_and_responsive_assets(self):
        portfolio = BeautifulSoup((ROOT / 'portfolio.html').read_text(), 'html.parser')
        originals = set()
        for card in portfolio.select('.v8-grid > article'):
            soup = BeautifulSoup((ROOT / card.a['href']).read_text(), 'html.parser')
            photos = extract_photos(soup)
            originals.update(item['href'] for item in photos)
            self.assertEqual({button['data-room'] for button in soup.select('.pd-rooms button')} - {''}, {ROOMS[item['href']] for item in photos})
            for figure in soup.select('.case-gallery figure'):
                self.assertEqual(figure['data-room'], ROOMS[figure.a['href']])
            representatives = json.loads(card['data-room-photos'])
            self.assertEqual(set(representatives), {ROOMS[item['href']] for item in photos})
            for room, preview in representatives.items():
                self.assertTrue(any(ROOMS[item['href']] == room and PREVIEWS[item['href']]['src'] == preview['src'] for item in photos))
            for img in soup.select('main img') + [card.img]:
                self.assertIn('sizes', img.attrs)
                for variant in img['srcset'].split(', '):
                    path, width = variant.rsplit(' ', 1)
                    self.assertTrue((ROOT / path.lstrip('/')).is_file())
                    self.assertRegex(width, r'^\d+w$')
        self.assertEqual(set(ROOMS), originals)
        self.assertEqual(len(originals), 678)
        self.assertTrue(set(ROOMS.values()) <= set(ROOM_ORDER))
        source = str(portfolio)
        refresh_portfolio(portfolio)
        self.assertEqual(str(portfolio), source)


if __name__ == '__main__':
    unittest.main()
