(() => {
  const form = document.querySelector('#portfolio-filters');
  if (!form) return;
  const roomNav = document.querySelector('.pf-rooms');
  const roomButtons = [...(roomNav?.querySelectorAll('[data-room]') || [])];
  const roomNames = new Set(roomButtons.map(button => button.dataset.room));
  const cards = [...document.querySelectorAll('.v8-grid > article')];
  const result = document.querySelector('#portfolio-result');
  const empty = document.querySelector('.v8-empty');
  const normalize = value => value.normalize('NFKC').toLocaleLowerCase('ko').replace(/\s+/g, '');
  let room = roomNames.has(new URL(location.href).searchParams.get('room') || '')
    ? new URL(location.href).searchParams.get('room') || '' : '';

  cards.forEach(card => {
    card.rooms = JSON.parse(card.dataset.roomPhotos);
    const image = card.querySelector('img');
    const link = card.querySelector('a[data-project]');
    card.defaultImage = Object.fromEntries(['src', 'srcset', 'alt', 'width', 'height', 'sizes'].map(name => [name, image.getAttribute(name)]));
    card.defaultHref = link.getAttribute('href');
  });

  function setUrl() {
    const url = new URL(location.href);
    room ? url.searchParams.set('room', room) : url.searchParams.delete('room');
    history.replaceState(history.state, '', url);
  }

  function showRoom(card) {
    const image = card.querySelector('img');
    const link = card.querySelector('a[data-project]');
    const source = room ? card.rooms[room] : card.defaultImage;
    if (!source) return;
    for (const name of ['srcset', 'sizes', 'alt', 'width', 'height', 'src']) {
      const value = source?.[name] ?? (room && name === 'sizes' ? card.defaultImage[name] : null);
      if (value == null && image.hasAttribute(name)) image.removeAttribute(name);
      else if (value != null && image.getAttribute(name) !== String(value)) image.setAttribute(name, value);
    }
    if (!room) {
      if (link.getAttribute('href') !== card.defaultHref) link.setAttribute('href', card.defaultHref);
      return;
    }
    const url = new URL(card.defaultHref, location.href);
    url.searchParams.set('room', room);
    url.hash = 'case-photos';
    const href = url.pathname + url.search + url.hash;
    if (link.getAttribute('href') !== href) link.setAttribute('href', href);
  }

  function update() {
    const words = form.elements.q.value.trim().split(/\s+/).filter(Boolean).map(normalize);
    const area = form.elements.area.value;
    const budget = form.elements.budget.value;
    const tags = [...form.querySelectorAll('[name="tag"]:checked')].map(input => input.value);
    let visible = 0;
    roomButtons.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.room === room)));
    cards.forEach(card => {
      const cardTags = (card.dataset.tags || '').split('|');
      const size = card.dataset.area || String(Math.min(Math.floor(Number(card.textContent.match(/(\d+)평/)?.[1]) / 10) * 10, 50));
      const amount = Number(card.dataset.budget || 0);
      const scope = (card.querySelector('.pf-scope')?.textContent || '').split(' · ').filter(part => !part.includes('문의')).join(' ');
      const text = normalize([card.querySelector('h2').textContent, card.querySelector('p').textContent,
        cardTags.join(' '), Object.keys(card.rooms).join(' '), scope,
        amount ? card.querySelector('.pf-budget')?.textContent || '' : ''].join(' '));
      card.hidden = Boolean(room && !card.rooms[room])
        || !words.every(word => text.includes(word))
        || Boolean(area && size !== area)
        || Boolean(budget && (budget === 'unknown' ? amount > 0 : amount < Number(budget)))
        || !tags.every(tag => cardTags.includes(tag));
      showRoom(card);
      if (!card.hidden) visible++;
    });
    const filtered = words.length || area || budget || tags.length || room;
    result.textContent = filtered ? `${cards.length}개 중 ${visible}개 현장` : `전체 ${cards.length}개 현장`;
    empty.hidden = visible > 0;
    form.querySelector('[type="reset"]').disabled = !filtered;
  }

  roomNav?.removeAttribute('hidden');
  roomButtons.forEach(button => button.addEventListener('click', () => {
    room = button.dataset.room;
    setUrl();
    update();
  }));
  form.hidden = false;
  const tools = form.closest('.pf-browse-tools');
  tools.hidden = false;
  const mobile = matchMedia('(max-width:680px)');
  function adaptTools() {
    tools.open = !mobile.matches;
    form.querySelector('.pf-tags').open = !mobile.matches;
  }
  mobile.addEventListener('change', adaptTools);
  adaptTools();
  form.addEventListener('submit', event => event.preventDefault());
  form.addEventListener('input', update);
  form.addEventListener('change', update);
  form.addEventListener('reset', () => {
    room = '';
    setUrl();
    setTimeout(update, 0);
  });
  function restoreUrlRoom() {
    const value = new URL(location.href).searchParams.get('room') || '';
    room = roomNames.has(value) ? value : '';
    update();
  }
  addEventListener('popstate', restoreUrlRoom);
  addEventListener('pageshow', restoreUrlRoom);
  update();
})();
