const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const test = require('node:test');

const base = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(base, 'assets/consultation-context.js'), 'utf8');
const formSource = fs.readFileSync(path.join(base, 'assets/consultation-form.js'), 'utf8');
const pages = ['consultation/index.html', 'consultation/apply/index.html'];

// Tiny DOM stub, deliberately without network/storage/form submission APIs.
function mount(file, search, readyState = 'complete', missing = false) {
  const html = fs.readFileSync(path.join(base, file), 'utf8');
  class Node {
    constructor(text = '') { this.textContent = text; this.attributes = {}; this.listeners = {}; }
    setAttribute(key, value) { this.attributes[key] = value; }
    appendChild(node) { this.textContent += node.tagName === 'br' ? '\n' : node.textContent; }
    addEventListener(name, fn) { this.listeners[name] = fn; }
  }
  const nodes = {};
  for (const match of html.matchAll(/<([a-z0-9]+)\b([^>]*data-consultation-context="([^"]+)"[^>]*)>/g)) {
    assert.equal(nodes[match[3]], undefined, `duplicate hook ${match[3]}`);
    nodes[match[3]] = new Node();
  }
  const root = new Node('untouched form');
  const listeners = {};
  const document = {
    title: html.match(/<title>(.*?)<\/title>/)[1], readyState,
    getElementById: id => id === 'consult-form-root' && !missing ? root : null,
    querySelector: selector => {
      const match = selector.match(/^\[data-consultation-context="([^"]+)"\]$/);
      assert.ok(match, `Only explicit presentation hooks are allowed: ${selector}`);
      return nodes[match[1]] || null;
    },
    createElement: tagName => Object.assign(new Node(), { tagName }),
    createTextNode: text => new Node(text),
    addEventListener: (name, fn) => { listeners[name] = fn; }
  };
  const location = Object.freeze({ search });
  vm.runInNewContext(source, { document, location, URLSearchParams });
  return { document, nodes, root, listeners, html, location };
}

for (const file of pages) {
  test(`${file}: shared content-hashed deferred script and explicit hooks`, () => {
    const { html, nodes } = mount(file, '?type=residential');
    const hash = crypto.createHash('sha256').update(source).digest('hex').slice(0, 8);
    const tag = `<script defer src="/assets/consultation-context.js?v=${hash}"></script>`;
    assert.ok(html.includes(tag));
    assert.equal(html.split('/assets/consultation-context.js').length - 1, 1);
    assert.ok(html.indexOf(tag) < html.indexOf('<script defer src="/assets/consultation-form.js'));
    for (const key of ['label', 'heading', 'help', 'note', 'footer', 'cta', 'description', 'og-title', 'og-description']) assert.ok(nodes[key], key);
    assert.match(html, /우리 집 조건부터,<br>함께 확인합니다/);
    assert.doesNotMatch(html, /필수 정보 네 가지만|기본 정보 네 가지로 신청/);
    assert.match(html, /기본 필수 정보 4가지/);
    assert.match(html, /개인정보 수집·이용 동의는 별도 필수/);
  });

  test(`${file}: residential ignores commercial vertical and retains original title`, () => {
    const page = mount(file, '?type=residential&vertical=office');
    assert.equal(page.document.title, page.html.match(/<title>(.*?)<\/title>/)[1]);
    assert.equal(page.nodes.label.textContent, '주거 인테리어 상담');
    assert.equal(page.nodes.heading.textContent, '우리 집 조건부터,\n함께 확인합니다');
    assert.match(page.nodes.help.textContent, /4가지\(성함, 연락처, 주소, 평형\)/);
    assert.doesNotMatch(page.nodes.help.textContent, /9가지|입주 희망일/);
    assert.equal(page.nodes.footer.textContent, '부산 주거 인테리어');
    assert.equal(page.root.listeners.change, undefined);
  });

  for (const [vertical, name, schedule, headline] of [
    ['shop', '상가', '오픈 희망일', '상가 오픈 준비부터,'],
    ['office', '사무실', '입주 희망일', '사무실 입주 준비부터,'],
    ['', '상업공간', '오픈·입주 희망일', '상업공간 조건부터,'],
    ['clinic', '상업공간', '오픈·입주 희망일', '상업공간 조건부터,'],
    ['<img onerror=alert(1)>', '상업공간', '오픈·입주 희망일', '상업공간 조건부터,']
  ]) {
    test(`${file}: commercial ${vertical || 'generic'} shows nine real fields and separate consent`, () => {
      const page = mount(file, '?type=commercial&vertical=' + encodeURIComponent(vertical));
      assert.equal(page.nodes.label.textContent, `${name} 인테리어 상담`);
      assert.equal(page.nodes.heading.textContent, `${headline}\n함께 확인합니다`);
      assert.equal(page.document.title, `부산 ${name} 인테리어 상담 신청 | 공간보감`);
      const required = page.nodes.help.textContent.match(/9가지\((.*?)\)/)[1].split(', ');
      assert.deepEqual(required, ['성명', '연락처', '업종·공간 유형', '현장 지역·주소', '전용면적', '현재 현장 상태', schedule, '예산 구간', '연락 가능한 시간']);
      assert.match(page.nodes.help.textContent, /개인정보 수집·이용 동의는 별도 필수/);
      assert.equal(page.nodes.footer.textContent, `부산 ${name} 인테리어`);
      assert.equal(page.nodes['og-title'].attributes.content, page.document.title);
      for (const key of ['description', 'og-description']) {
        assert.match(page.nodes[key].attributes.content, /9가지/);
        assert.doesNotMatch(page.nodes[key].attributes.content, /우리 집|주거|네 가지|4가지|<img/);
      }
      assert.match(page.nodes.note.textContent, /예산은 미정/);
      assert.equal(page.root.textContent, 'untouched form');
    });
  }

  for (const search of ['', '?vertical=shop', '?type=unknown&vertical=office', '?type=Commercial']) {
    test(`${file}: neutral choice state for ${search || 'no query'}`, () => {
      const page = mount(file, search);
      assert.equal(page.nodes.label.textContent, '인테리어 상담');
      assert.match(page.nodes.heading.textContent, /유형부터 선택/);
      assert.equal(page.nodes.cta.textContent, '상담 유형 선택');
      assert.match(page.nodes.help.textContent, /주거는 기본 필수 정보 4가지, 상업공간은 9가지/);
      assert.equal(page.document.title, '부산 인테리어 상담 신청 | 공간보감');
      assert.equal(page.nodes.footer.textContent, '부산 인테리어');
    });
  }

  test(`${file}: user vertical change refreshes copy without changing fields or attribution`, () => {
    const search = '?type=commercial&vertical=shop&utm_source=meta&ad_id=123&is_test=1';
    const page = mount(file, search);
    const target = Object.freeze({ name: 'qvertical', value: 'office' });
    page.root.listeners.change({ target });
    assert.equal(page.nodes.label.textContent, '사무실 인테리어 상담');
    assert.match(page.nodes.help.textContent, /입주 희망일/);
    assert.doesNotMatch(page.nodes.help.textContent, /오픈 희망일/);
    page.root.listeners.change({ target: { name: 'qname', value: 'shop' } });
    assert.equal(page.nodes.label.textContent, '사무실 인테리어 상담');
    page.root.listeners.change({ target: { name: 'qvertical', value: 'other' } });
    assert.equal(page.nodes.label.textContent, '상업공간 인테리어 상담');
    assert.equal(page.location.search, search);
    assert.equal(page.root.textContent, 'untouched form');
  });
}

test('DOMContentLoaded initialization and absent form root are safe', () => {
  const page = mount(pages[0], '?type=commercial&vertical=shop', 'loading');
  assert.equal(page.nodes.label.textContent, '');
  page.listeners.DOMContentLoaded();
  assert.equal(page.nodes.label.textContent, '상가 인테리어 상담');
  assert.doesNotThrow(() => mount(pages[0], '?type=commercial', 'complete', true));
});

test('documented nine commercial and four residential fields match existing form contract', () => {
  const commercial = formSource.match(/var COMMERCIAL_QUESTIONS = (\[[\s\S]*?\n  \]);/)[1];
  const questions = vm.runInNewContext(commercial);
  assert.equal(questions.filter(q => q.isRequired).length, 9);
  assert.equal(questions.filter(q => !q.isRequired).length, 1);
  assert.equal(questions.find(q => !q.isRequired).id, 'requestNote');
  const matchers = formSource.match(/var CORE_REQUIRED_MATCHERS = (\[[\s\S]*?\n  \]);/)[1];
  assert.equal(vm.runInNewContext(matchers).length, 4);
  assert.match(formSource, /select.name = name/);
  assert.match(formSource, /var name = 'q' \+ question.id/);
});

test('presentation script has no submission, tracking, storage or untrusted HTML writes', () => {
  assert.doesNotMatch(source, /fetch\(|XMLHttpRequest|sendBeacon|localStorage|sessionStorage|\.innerHTML|\.value\s*=|\.href\s*=|pushState|replaceState|\.submit\(/);
  assert.doesNotMatch(source, /무료|최저가|가격 보장|즉시견적|실시간 견적/);
});
