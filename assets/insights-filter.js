(() => {
  const cards = [...document.querySelectorAll('.posts .post-card')];
  const filters = [...document.querySelectorAll('.toolbar a[href="#all"], .toolbar a[href="#estimate"], .toolbar a[href="#area"]')];
  if (!cards.length || !filters.length) return;

  function update() {
    const selected = ['#estimate', '#area'].includes(location.hash) ? location.hash : '#all';
    filters.forEach(link => {
      if (link.getAttribute('href') === selected) link.setAttribute('aria-current', 'true');
      else link.removeAttribute('aria-current');
    });
    cards.forEach(card => {
      const category = card.querySelector('.cat')?.textContent.trim() || '';
      const isArea = /(구|동|해운대|센텀)/.test(category);
      card.style.display = selected === '#estimate' && category !== '견적·상담' || selected === '#area' && !isArea ? 'none' : '';
    });
  }

  addEventListener('hashchange', update);
  update();
})();
