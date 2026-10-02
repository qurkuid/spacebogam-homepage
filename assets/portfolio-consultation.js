(function () {
  const entry = document.querySelector('.sb-consult-entry');
  const grid = document.querySelector('.v8-grid');
  if (!entry || !grid) return;
  const cards = grid.querySelectorAll('article');
  if (cards.length < 4) return;
  const middle = entry.cloneNode(true);
  middle.removeAttribute('aria-labelledby');
  middle.querySelector('h2').removeAttribute('id');
  middle.querySelector('h2').textContent = '사례를 보셨다면, 우리 집 조건을 알려주세요.';
  middle.querySelector('a').dataset.ctaLocation = 'portfolio_middle';
  grid.insertBefore(middle, cards[3]);
})();
