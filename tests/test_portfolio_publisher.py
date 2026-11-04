import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import scripts_case_builder as builder


class PortfolioPublisherTest(unittest.TestCase):
    def test_gallery_anchor_survives_repeat_publishing(self):
        source = (builder.ROOT / 'portfolio.html').read_text(encoding='utf-8')
        case = builder.CaseEntry(
            slug='fixture-project', title='Fixture', kind='apartment',
            location='Busan', pyeong='35평', summary='Fixture', description='Fixture',
            thumbnail=builder.CaseImage('assets/fixture.jpg', 'Fixture photo'),
            status='published',
        )
        with tempfile.TemporaryDirectory() as directory:
            portfolio = Path(directory) / 'portfolio.html'
            portfolio.write_text(source, encoding='utf-8')
            with patch.object(builder, 'PORTFOLIO_HTML', portfolio):
                self.assertTrue(builder.sync_portfolio_grid([case]))
                first = portfolio.read_text(encoding='utf-8')
                self.assertTrue(builder.sync_portfolio_grid([case]))
                self.assertEqual(first, portfolio.read_text(encoding='utf-8'))
                self.assertEqual(first.count('data-managed-by="case-admin"'), 1)
                self.assertIn('id="project-list"', first)
                self.assertEqual(first.count('data-project='), 16)
                builder.sync_portfolio_grid([])
                self.assertEqual(source, portfolio.read_text(encoding='utf-8'))


if __name__ == '__main__':
    unittest.main()
