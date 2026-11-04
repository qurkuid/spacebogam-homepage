(() => {
  const galleryLinks = document.querySelectorAll('[data-gallery-image]');
  const links = [...(galleryLinks.length ? galleryLinks : document.querySelectorAll('.case-gallery a'))];
  if (!links.length) return;
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
  let index = 0, trigger, previousOverflow, touchStart;
  function show(next) {
    index = (next + links.length) % links.length;
    image.alt = links[index].querySelector('img')?.alt || '현장 사진';
    caption.textContent = image.alt;
    image.src = links[index].href;
    dialog.querySelector('.lb-count').textContent = `${index + 1} / ${links.length}`;
  }
  links.forEach((link, position) => link.addEventListener('click', event => {
    event.preventDefault();
    trigger = link;
    previousOverflow = document.body.style.overflow;
    show(position);
    dialog.showModal();
    dialog.classList.add('open');
    document.body.style.overflow = 'hidden';
  }));
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
