const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

test('insights tabs filter the published article cards', () => {
  const html = fs.readFileSync('insights/index.html', 'utf8');
  assert.match(html, /assets\/insights-filter\.js/);
  const categories = [...html.matchAll(/<article class="post-card">[\s\S]*?<span class="cat">([^<]+)<\/span>/g)].map(match => match[1]);
  assert.equal(categories.length, 50);

  const cards = categories.map(category => ({
    style: {},
    querySelector: () => ({ textContent: category }),
  }));
  const filters = ['#all', '#estimate', '#area'].map(href => ({
    href,
    attrs: {},
    getAttribute: () => href,
    setAttribute(name, value) { this.attrs[name] = value; },
    removeAttribute(name) { delete this.attrs[name]; },
  }));
  const location = { hash: '' };
  let onHashChange;
  vm.runInNewContext(fs.readFileSync('assets/insights-filter.js', 'utf8'), {
    document: { querySelectorAll: selector => selector.startsWith('.posts') ? cards : filters },
    location,
    addEventListener: (_, callback) => { onHashChange = callback; },
  });

  const visible = () => cards.filter(card => card.style.display !== 'none').length;
  assert.equal(visible(), 50);
  location.hash = '#estimate'; onHashChange();
  assert.equal(visible(), 37);
  assert.equal(filters[1].attrs['aria-current'], 'true');
  location.hash = '#area'; onHashChange();
  assert.equal(visible(), 11);
  location.hash = '#unknown'; onHashChange();
  assert.equal(visible(), 50);
});
