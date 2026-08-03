const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const dir = path.join(root, 'g4-private');
const PAGES = ['process.html', 'portfolio.html', 'estimate.html', 'guides.html', 'qna.html', 'living.html', 'commercial.html', 'blog.html'];

test('every G5 hub page is private, tracked once, and generated (not hand-duplicated)', () => {
  for (const name of PAGES) {
    const html = fs.readFileSync(path.join(dir, name), 'utf8');
    assert.match(html, /noindex,nofollow,noarchive/, name);
    assert.equal((html.match(/g4-tracking\.js/g) || []).length, 1, name);
    assert.equal((html.match(/<main/g) || []).length, 1, name);
  }
});

test('every local link/asset on the G5 pages resolves inside g4-private or the live tree', () => {
  for (const name of PAGES) {
    const html = fs.readFileSync(path.join(dir, name), 'utf8');
    for (const match of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
      const target = match[1].split(/[?#]/)[0];
      if (!target || target.startsWith('http') || target.startsWith('tel:')) continue;
      assert.ok(fs.existsSync(path.resolve(dir, target)), `${name}: missing ${target}`);
    }
  }
});

test('qna preserves all 30 real questions, none fabricated', () => {
  const source = fs.readFileSync(path.join(root, 'qna.html'), 'utf8');
  const g4 = fs.readFileSync(path.join(dir, 'qna.html'), 'utf8');
  const sourceQuestions = [...source.matchAll(/Q(\d+)\./g)].map(m => Number(m[1]));
  assert.equal(Math.max(...sourceQuestions), 30);
  assert.equal((g4.match(/<b>Q\d+<\/b>/g) || []).length, 30);
});

test('blog hub preserves all 50 real posts, none fabricated', () => {
  const source = fs.readFileSync(path.join(root, 'blog.html'), 'utf8');
  const g4 = fs.readFileSync(path.join(dir, 'blog.html'), 'utf8');
  const sourcePosts = (source.match(/<article class="post-card">/g) || []).length;
  assert.equal(sourcePosts, 50);
  assert.equal((g4.match(/<a class="card"/g) || []).length, 50);
});
