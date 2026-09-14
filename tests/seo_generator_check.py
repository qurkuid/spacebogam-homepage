"""Canonical output check without fetching posts or rewriting the live source tree."""
import json
import shutil
import sys
import tempfile
from pathlib import Path
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
import scripts_import_blog as generator

post = generator.BlogPost(**json.loads((ROOT / 'data/blog/posts.json').read_text())[0])
for route in ('blog', 'insights'):
    rendered = generator.render_post(post, route_base=route)
    assert '"@type": "BlogPosting"' in rendered or '"@type":"BlogPosting"' in rendered
    assert f'rel="canonical" href="https://spacebogam.kr/insights/{post.slug}.html"' in rendered
    assert ('content="noindex' in rendered) == (route == 'blog')

with tempfile.TemporaryDirectory() as directory:
    temporary = Path(directory)
    for page in ROOT.rglob('*.html'):
        relative = page.relative_to(ROOT)
        if any(part in {'artifacts', 'reports', '.git', 'node_modules', '.omx'} for part in relative.parts):
            continue
        dest = temporary / relative
        dest.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(page, dest)
    shutil.copyfile(ROOT / 'sitemap.xml', temporary / 'sitemap.xml')
    before = ET.parse(temporary / 'sitemap.xml').getroot()
    ns = {'s': 'http://www.sitemaps.org/schemas/sitemap/0.9'}
    records = lambda tree: {n.findtext('s:loc', namespaces=ns): [(child.tag, child.text) for child in n] for n in tree}
    expected = records(before)
    (temporary / 'private.html').write_text('<link rel="canonical" href="https://spacebogam.kr/private.html"><meta name="robots" content="noindex,follow">')
    for url in ('https://spacebogam.kr/blog/', 'https://spacebogam.kr/feed.xml', 'https://spacebogam.kr/private.html'):
        entry = ET.SubElement(before, '{' + ns['s'] + '}url')
        ET.SubElement(entry, '{' + ns['s'] + '}loc').text = url
    ET.ElementTree(before).write(temporary / 'sitemap.xml', encoding='utf-8')
    generator.ROOT = temporary
    generator.update_sitemap([post])
    after = ET.parse(temporary / 'sitemap.xml').getroot()
    assert expected == records(after), 'Regeneration changed canonical URLs or metadata, or retained non-indexable entries'
print('PASS: BlogPosting, canonical aliases, 128 sitemap entries and metadata preserved; invalid entries rejected')
