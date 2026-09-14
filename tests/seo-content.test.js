const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const home = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const schemas = [...home.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
  .map((match) => JSON.parse(match[1]));
const normalize = (text) => text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const visible = normalize(home.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/g, ''));

test('homepage FAQ markup only describes questions and answers present in the body', () => {
  for (const schema of schemas.filter((item) => item['@type'] === 'FAQPage')) {
    for (const question of schema.mainEntity) {
      assert.ok(visible.includes(normalize(question.name)), `Invisible FAQ: ${question.name}`);
      assert.ok(visible.includes(normalize(question.acceptedAnswer.text)), `Invisible answer: ${question.name}`);
    }
  }
});

test('homepage navigation schema follows the visible header destinations', () => {
  const header = home.match(/<header\b[^>]*>([\s\S]*?)<\/header>/)[1];
  const destinations = [...header.matchAll(/href="([^"]+)"/g)]
    .slice(1).map((match) => new URL(match[1], 'https://spacebogam.kr/').href);
  const schema = schemas.find((item) => item['@id'] === 'https://spacebogam.kr/#site-navigation');
  assert.deepEqual(schema.itemListElement.map((item) => item.url), destinations);
});

test('homepage portfolio schema references every visible carousel case in order', () => {
  const carousel = home.match(/<ul class="v8-case-carousel-track">([\s\S]*?)<\/ul>/)[1];
  const destinations = [...carousel.matchAll(/href="([^"]+)"/g)]
    .map((match) => new URL(match[1], 'https://spacebogam.kr/').href);
  const schema = schemas.find((item) => item['@type'] === 'ItemList' && !item['@id']);
  assert.deepEqual(schema.itemListElement.map((item) => item.item.url), destinations);
});
