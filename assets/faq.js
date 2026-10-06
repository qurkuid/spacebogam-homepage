(() => {
  const root = document.querySelector('[data-faq-page]');
  if (!root) return;
  const form = root.querySelector('[data-faq-search]');
  const input = form.querySelector('input');
  const items = [...root.querySelectorAll('[data-faq-question]')];
  const stages = [...root.querySelectorAll('[data-faq-stage]')];
  const count = root.querySelector('[data-faq-count]');
  const empty = root.querySelector('[data-faq-empty]');
  const more = root.querySelector('.faq-more');
  const normalize = text => text.normalize('NFKC').toLocaleLowerCase('ko').replace(/\s+/g, ' ').trim();
  const texts = items.map(item => normalize(item.textContent));
  function filter() {
    const terms = normalize(input.value).split(' ').filter(Boolean);
    let matches = 0;
    items.forEach((item, index) => {
      const visible = terms.every(term => texts[index].includes(term));
      item.hidden = !visible;
      item.open = terms.length > 0 && visible;
      if (visible) matches += 1;
    });
    stages.forEach(stage => { stage.hidden = ![...stage.querySelectorAll('[data-faq-question]')].some(item => !item.hidden); });
    root.querySelectorAll('.faq-next').forEach(link => { link.hidden = terms.length > 0; });
    empty.hidden = matches > 0;
    more.hidden = terms.length > 0;
    count.textContent = terms.length ? `관련 질문 ${matches}개` : `전체 질문 ${items.length}개 · 질문을 누르면 답변이 열립니다.`;
  }
  function revealHash() {
    const target = document.getElementById(location.hash.slice(1));
    if (!target || !root.contains(target)) return;
    input.value = '';
    filter();
    if (target.matches('details')) target.open = true;
    target.scrollIntoView({ block: 'start' });
  }
  form.hidden = false;
  input.addEventListener('input', filter);
  root.querySelectorAll('[data-faq-reset]').forEach(button => button.addEventListener('click', () => {
    input.value = '';
    filter();
    input.focus();
  }));
  root.querySelector('.faq-stage-nav').addEventListener('click', event => {
    const link = event.target.closest('a');
    if (link && link.hash === location.hash) revealHash();
  });
  window.addEventListener('hashchange', revealHash);
  filter();
  revealHash();
})();
