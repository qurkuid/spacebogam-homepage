import json
import unittest
from pathlib import Path
from scripts.site_footer import refresh_footer
from scripts.render_sns import render_sns


class SiteFooterTest(unittest.TestCase):
    def test_preserves_links_is_idempotent_and_skips_redirects(self):
        source = '<html><head></head><body><main>content</main><footer><a href="/custom/">Keep</a></footer></body></html>'
        updated = refresh_footer(source)
        self.assertIn('부산진2022-02-07', updated)
        self.assertIn('625-43-01028', updated)
        self.assertIn('href="/custom/"', updated)
        self.assertIn('href="/sns/"', updated)
        self.assertEqual(refresh_footer(updated), updated)
        redirect = source.replace('</head>', '<meta name="robots" content="noindex,follow"></head>')
        self.assertEqual(refresh_footer(redirect), redirect)

    def test_blog_cards_use_real_imported_sources(self):
        root = Path(__file__).resolve().parents[1]
        posts = json.loads((root / 'data/blog/posts.json').read_text())
        page = render_sns(posts)
        self.assertEqual(page.count('class="sns-card"'), 6)
        for post in sorted(posts, key=lambda p: p['date'], reverse=True)[:6]:
            self.assertIn(post['source'], page)
            self.assertTrue((root / post['cover'].lstrip('/')).is_file())
        self.assertIn('/assets/sns.js', page)
        self.assertNotIn('access_token', page)


if __name__ == '__main__':
    unittest.main()
