(() => {
  const cards = [...document.querySelectorAll('.posts .post-card')];
  const links = [...document.querySelectorAll('.toolbar a[href="#all"], .toolbar a[href="#estimate"], .toolbar a[href="#area"]')];
  if (!cards.length || !links.length) return;
  function update() {
    const selected = ['#estimate', '#area'].includes(location.hash) ? location.hash : '#all';
    links.forEach(a => { if (a.hash === selected) a.setAttribute('aria-current', 'true'); else a.removeAttribute('aria-current'); });
    cards.forEach(card => {
      const category = card.querySelector('.cat')?.textContent.trim() || '';
      const area = /(구|동|해운대|센텀)/.test(category);
      card.hidden = selected === '#estimate' ? category !== '견적·상담' : selected === '#area' ? !area : false;
      card.style.display = card.hidden ? 'none' : '';
    });
  }
  addEventListener('hashchange', update);
  update();
})();
