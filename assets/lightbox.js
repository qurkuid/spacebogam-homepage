(() => {
  // Before/process photos are opt-in and never enter the completed-photo lightbox.
  const stageTabs = [...document.querySelectorAll('[data-photo-stage]')];
  function selectStage(stage, focus = false) {
    stageTabs.forEach(tab => {
      const active = tab.dataset.photoStage === stage;
      tab.setAttribute('aria-selected', String(active));
      tab.tabIndex = active ? 0 : -1;
      const panel = document.getElementById(tab.getAttribute('aria-controls'));
      if (panel) panel.hidden = !active;
      if (active && focus) tab.focus();
    });
  }
  stageTabs.forEach((tab, index) => {
    tab.addEventListener('click', () => selectStage(tab.dataset.photoStage));
    tab.addEventListener('keydown', event => {
      let next;
      if (event.key === 'ArrowRight') next = (index + 1) % stageTabs.length;
      else if (event.key === 'ArrowLeft') next = (index + stageTabs.length - 1) % stageTabs.length;
      else if (event.key === 'Home') next = 0;
      else if (event.key === 'End') next = stageTabs.length - 1;
      else return;
      event.preventDefault();
      selectStage(stageTabs[next].dataset.photoStage, true);
    });
  });
  selectStage('after');
  const galleryLinks = [...document.querySelectorAll('[data-gallery-image]')];
  const links = galleryLinks.length ? galleryLinks : [...document.querySelectorAll('.case-gallery a')];
  if (!links.length) return;
  const roomNav = document.querySelector('.pd-rooms');
  const roomButtons = [...(roomNav?.querySelectorAll('[data-room]') || [])];
  const roomNames = new Set(roomButtons.map(button => button.dataset.room));
  let room = roomNames.has(new URL(location.href).searchParams.get('room') || '')
    ? new URL(location.href).searchParams.get('room') || '' : '';
  const figures = [...document.querySelectorAll('#case-photos .case-gallery figure')];
  const photoCount = document.querySelector('.pd-photo-count');
  const total = figures.length;
  const preloaded = new Map();

  function preloadUrl(url) {
    if (!url || preloaded.has(url)) return preloaded.get(url);
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    preloaded.set(url, img);
    return img;
  }

  function setBackLinks() {
    document.querySelectorAll('a.pd-back[href*="portfolio"]').forEach(link => {
      link.dataset.baseHref ||= link.getAttribute('href');
      const url = new URL(link.dataset.baseHref, location.href);
      room ? url.searchParams.set('room', room) : url.searchParams.delete('room');
      link.setAttribute('href', url.pathname + url.search + url.hash);
    });
  }

  function filter(next, changeUrl = true) {
    room = roomNames.has(next) ? next : '';
    roomButtons.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.room === room)));
    let visible = 0;
    figures.forEach(figure => {
      figure.hidden = Boolean(room && figure.dataset.room !== room);
      if (!figure.hidden) {
        visible++;
        const img = figure.querySelector('img');
        if (img && visible <= 8) {
          img.loading = 'eager';
          img.setAttribute('fetchpriority', visible <= 4 ? 'high' : 'auto');
        }
      }
    });
    document.getElementById('sb-early-room-style')?.remove();
    if (photoCount) photoCount.textContent = room ? `${room} ${visible}장 · 전체 ${total}장` : `전체 ${total}장`;
    setBackLinks();
    if (changeUrl) {
      const url = new URL(location.href);
      room ? url.searchParams.set('room', room) : url.searchParams.delete('room');
      history.replaceState(history.state, '', url);
    }
  }

  roomNav?.removeAttribute('hidden');
  roomButtons.forEach(button => button.addEventListener('click', () => filter(button.dataset.room)));
  const restoreUrlRoom = () => filter(new URL(location.href).searchParams.get('room') || '', false);
  addEventListener('popstate', restoreUrlRoom);
  addEventListener('pageshow', restoreUrlRoom);
  filter(room, false);

  const dialog = document.createElement('dialog');
  if (typeof dialog.showModal !== 'function') return;
  dialog.className = 'lb';
  dialog.setAttribute('aria-label', '현장 사진 크게 보기');
  dialog.innerHTML = '<div class="lb-top"><span class="lb-count" role="status" aria-live="polite"></span><button class="lb-close" type="button" aria-label="닫기" autofocus>×</button></div>' +
    '<div class="lb-viewport"><button class="lb-nav lb-prev" type="button" aria-label="이전 사진">‹</button><div class="lb-track"><figure class="lb-slide"><img alt=""></figure></div><button class="lb-nav lb-next" type="button" aria-label="다음 사진">›</button></div><p class="lb-caption"></p>';
  document.body.appendChild(dialog);
  const image = dialog.querySelector('img');
  const caption = dialog.querySelector('.lb-caption');
  const viewport = dialog.querySelector('.lb-viewport');
  let current, index = 0, trigger, previousOverflow, touchStart;
  const activeLinks = () => links.filter(link => !link.closest('[hidden]'));

  function preloadNeighbors() {
    if (!current || !current.length) return;
    [1, -1, 2].forEach(offset => {
      const target = current[(index + offset + current.length) % current.length];
      if (target?.href) preloadUrl(target.href);
    });
  }

  function show(next) {
    current = activeLinks();
    if (!current.length) return;
    index = (next + current.length) % current.length;
    const thumb = current[index].querySelector('img');
    const previewSrc = thumb?.currentSrc || thumb?.src || '';
    if (previewSrc) {
      image.style.backgroundImage = `url("${previewSrc}")`;
      image.style.backgroundSize = 'contain';
      image.style.backgroundPosition = 'center';
      image.style.backgroundRepeat = 'no-repeat';
    } else {
      image.style.backgroundImage = '';
    }
    image.alt = thumb?.alt || '현장 사진';
    caption.textContent = image.alt;
    image.src = current[index].href;
    dialog.querySelector('.lb-count').textContent = `${index + 1} / ${current.length}`;
    preloadNeighbors();
  }
  image.addEventListener('load', () => {
    image.style.backgroundImage = '';
  });
  function open(link, focusTarget = link) {
    current = activeLinks();
    const position = current.indexOf(link);
    if (position < 0) return;
    trigger = focusTarget;
    previousOverflow = document.body.style.overflow;
    show(position);
    dialog.showModal();
    dialog.classList.add('open');
    document.body.style.overflow = 'hidden';
  }
  links.forEach(link => {
    link.addEventListener('pointerenter', () => preloadUrl(link.href), { passive: true });
    link.addEventListener('touchstart', () => preloadUrl(link.href), { passive: true });
    link.addEventListener('click', event => {
      event.preventDefault();
      open(link);
    });
  });
  const cover = document.querySelector('[data-gallery-cover]');
  if (cover) {
    cover.addEventListener('pointerenter', () => preloadUrl(cover.href), { passive: true });
    cover.addEventListener('touchstart', () => preloadUrl(cover.href), { passive: true });
  }
  cover?.addEventListener('click', event => {
    event.preventDefault();
    selectStage('after');
    let match = links.find(link => link.href === cover.href);
    if (!match) return;
    if (match.closest('figure')?.hidden) {
      filter('');
      match = links.find(link => link.href === cover.href);
    }
    open(match, cover);
  });
  dialog.querySelector('.lb-close').addEventListener('click', () => dialog.close());
  dialog.querySelector('.lb-prev').addEventListener('click', () => show(index - 1));
  dialog.querySelector('.lb-next').addEventListener('click', () => show(index + 1));
  dialog.addEventListener('close', () => {
    dialog.classList.remove('open');
    document.body.style.overflow = previousOverflow;
    touchStart = null;
    trigger?.focus({ preventScroll: true });
  });
  dialog.addEventListener('click', event => {
    if (event.target === dialog || event.target === viewport) dialog.close();
  });
  dialog.addEventListener('keydown', event => {
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      show(index + (event.key === 'ArrowRight' ? 1 : -1));
    }
  });
  image.addEventListener('error', () => { caption.textContent = '사진을 불러오지 못했습니다. 다른 사진을 선택해 주세요.'; });
  viewport.addEventListener('touchstart', event => {
    touchStart = { x: event.touches[0].clientX, y: event.touches[0].clientY };
  }, { passive: true });
  viewport.addEventListener('touchend', event => {
    if (!touchStart) return;
    const dx = event.changedTouches[0].clientX - touchStart.x;
    const dy = event.changedTouches[0].clientY - touchStart.y;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) show(index + (dx < 0 ? 1 : -1));
    touchStart = null;
  });
  viewport.addEventListener('touchcancel', () => { touchStart = null; });
})();
