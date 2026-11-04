(() => {
  const form = document.querySelector('#portfolio-filters');
  if (!form) return;
  const cards = [...document.querySelectorAll('.v8-grid > article')];
  const result = document.querySelector('#portfolio-result');
  const empty = document.querySelector('.v8-empty');
  const normalize = value => value.normalize('NFKC').toLocaleLowerCase('ko').replace(/\s+/g, '');

  function update() {
    const words = form.elements.q.value.trim().split(/\s+/).filter(Boolean).map(normalize);
    const area = form.elements.area.value;
    const budget = form.elements.budget.value;
    const tags = [...form.querySelectorAll('[name="tag"]:checked')].map(input => input.value);
    let visible = 0;
    cards.forEach(card => {
      const cardTags = (card.dataset.tags || '').split('|');
      const size = card.dataset.area || String(Math.min(Math.floor(Number(card.textContent.match(/(\d+)평/)?.[1]) / 10) * 10, 50));
      const amount = Number(card.dataset.budget || 0);
      const scope = (card.querySelector('.pf-scope')?.textContent || '').split(' · ').filter(part => !part.includes('문의')).join(' ');
      const text = normalize([card.querySelector('h2').textContent, card.querySelector('p').textContent,
        cardTags.join(' '), scope, amount ? card.querySelector('.pf-budget')?.textContent || '' : ''].join(' '));
      card.hidden = !words.every(word => text.includes(word))
        || Boolean(area && size !== area)
        || Boolean(budget && (budget === 'unknown' ? amount > 0 : amount < Number(budget)))
        || !tags.every(tag => cardTags.includes(tag));
      if (!card.hidden) visible++;
    });
    const filtered = words.length || area || budget || tags.length;
    result.textContent = filtered ? `${cards.length}개 중 ${visible}개 현장` : `전체 ${cards.length}개 현장`;
    empty.hidden = visible > 0;
    form.querySelector('[type="reset"]').disabled = !filtered;
  }

  form.hidden = false;
  if (matchMedia('(max-width:680px)').matches) form.querySelector('.pf-tags').open = false;
  form.addEventListener('submit', event => event.preventDefault());
  form.addEventListener('input', update);
  form.addEventListener('change', update);
  form.addEventListener('reset', () => setTimeout(update, 0));
  addEventListener('pageshow', update);
  update();
})();
