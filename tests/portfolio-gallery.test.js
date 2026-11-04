const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '../portfolio.html'), 'utf8');
const cards = [...html.matchAll(/<article\b[^>]*>[\s\S]*?<\/article>/g)].map(match => match[0]);

test('all 15 live projects and their photos remain indexable and linked to the schema', () => {
  const schema = JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
  assert.equal(cards.length, 15);
  assert.equal(schema.mainEntity.numberOfItems, cards.length);
  const links = cards.map(card => 'https://spacebogam.kr/' + card.match(/href="([^"]+)"/)[1]);
  assert.deepEqual(schema.mainEntity.itemListElement.map(item => item.url), links);
  for (const card of cards) {
    assert.match(card, /data-v8-event="portfolio_project_open"/);
    assert.match(card, /<img\b[^>]*alt="[^"]+"/);
    assert.doesNotMatch(card, /\bhidden\b/);
  }
  assert.match(html, /678/);
});

test('filters use complete options and explicit scope without the old guide', () => {
  assert.doesNotMatch(html, /<\/option[^>]+>/);
  assert.doesNotMatch(html, /id="lifestyle-case-guide"/);
  assert.match(cards[0], /샤시 포함 · 시스템에어컨 4대 · 확장 6개/);
  assert.match(cards[0], /data-budget="10000"/);
  assert.match(html, /role="status"/);
});
