const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const mappings = JSON.parse(fs.readFileSync(path.join(root, 'data/cases/project-concept-diagrams.json'), 'utf8')).diagrams;
const sitemap = fs.readFileSync(path.join(root, 'sitemap.xml'), 'utf8');
const realPhotoCounts = {
  'case-sajik-32py.html': 55,
  'case-sajik-ssangyong.html': 2,
  'case-mega-centum-49py.html': 74,
  'case-daewoo-ian-35py.html': 50,
  'case-guseo-ssangyong-sweetdot-home.html': 162,
};

test('concept assets exist, explain provenance, and do not claim measured construction plans', () => {
  assert.equal(Object.keys(mappings).length, 5);
  for (const [page, item] of Object.entries(mappings)) {
    assert.ok(item.path.startsWith('/assets/diagrams/'), page);
    assert.match(item.path, /-concept\.svg$/);
    assert.ok(item.alt.length >= 25 && item.alt.length < 180);
    assert.ok(fs.existsSync(path.join(root, item.source.replace(/^\//, ''))), item.source);
    const svg = fs.readFileSync(path.join(root, item.path.replace(/^\//, '')), 'utf8');
    assert.match(svg, /<svg\s/);
    assert.match(svg, /<title id="svg-title">/);
    assert.match(svg, /<desc id="svg-desc">/);
    assert.match(svg, /viewBox="0 0 1200 740"/);
    assert.match(svg, /실제 실측 도면, 벽체 위치 및 치수 아님/);
    assert.ok(svg.trimEnd().endsWith('</svg>'));
    assert.doesNotMatch(svg, /<script\b/i);
  }
});

test('five pages have inline indexable illustration, zoom source, accessible alt and honest captions', () => {
  for (const [page, item] of Object.entries(mappings)) {
    const html = fs.readFileSync(path.join(root, page), 'utf8');
    assert.equal((html.match(/class="sb-concept-figure"/g) || []).length, 1, page);
    assert.ok(html.includes('src="' + item.path + '"'), page);
    assert.ok(html.includes('href="' + item.path + '"'), page);
    assert.ok(html.includes('alt="' + item.alt + '"'), page);
    assert.ok(html.includes(item.summary), page);
    assert.ok(html.includes('실측 도면·실제 벽체 위치·축척·시공 상세도면이 아닙니다'), page);
    assert.match(html, /case-concept-diagrams\.css\?v=20261022/);
    assert.match(html, /rel="canonical"/);
    assert.match(html, /GTM-PW8GLP8S/);
    assert.match(html, /G-EJGXDD5C1T/);
    assert.match(html, /\/consultation\/\?type=residential/);
    assert.ok(html.includes('완성 사진 ' + realPhotoCounts[page] + '장'), page);
  }
});

test('five SVG image-sitemap references belong to exactly the five indexable case pages', () => {
  assert.match(sitemap, /xmlns:image="http:\/\/www\.google\.com\/schemas\/sitemap-image\/1\.1"/);
  assert.equal((sitemap.match(/<image:loc>/g) || []).length, 5);
  for (const [page, item] of Object.entries(mappings)) {
    const loc = 'https://spacebogam.kr/' + page;
    const diagram = 'https://spacebogam.kr' + item.path;
    const blocks = [...sitemap.matchAll(/<url>([\s\S]*?)<\/url>/g)]
      .map(match => match[1])
      .filter(block => block.includes('<loc>' + loc + '</loc>'));
    assert.equal(blocks.length, 1, page);
    assert.ok(blocks[0].includes('<image:loc>' + diagram + '</image:loc>'), page);
  }
});
