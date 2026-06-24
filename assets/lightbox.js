/* 공간보감 — 케이스 갤러리 라이트박스 슬라이더
   .case-gallery 의 사진을 클릭하면 전체화면으로 열려 좌우로 연속 슬라이드(화살표·키보드·스와이프). */
(function () {
  var gal = document.querySelector('.case-gallery');
  if (!gal) return;
  var links = [].slice.call(gal.querySelectorAll('a'));
  var urls = links.map(function (a) { return a.getAttribute('href'); }).filter(Boolean);
  if (!urls.length) return;

  var lb = document.createElement('div');
  lb.className = 'lb';
  lb.innerHTML =
    '<div class="lb-top"><span class="lb-count"></span><button class="lb-close" type="button" aria-label="닫기">×</button></div>' +
    '<div class="lb-viewport"><button class="lb-nav lb-prev" type="button" aria-label="이전">‹</button>' +
    '<div class="lb-track"></div>' +
    '<button class="lb-nav lb-next" type="button" aria-label="다음">›</button></div>';
  document.body.appendChild(lb);

  var track = lb.querySelector('.lb-track');
  var count = lb.querySelector('.lb-count');
  var vp = lb.querySelector('.lb-viewport');
  var N = urls.length, idx = 0;

  urls.forEach(function () {
    var s = document.createElement('div');
    s.className = 'lb-slide';
    s.appendChild(document.createElement('img'));
    track.appendChild(s);
  });
  var slides = [].slice.call(track.children);

  function load(i) {
    if (i < 0 || i >= N) return;
    var im = slides[i].firstChild;
    if (!im.getAttribute('src')) im.setAttribute('src', urls[i]);
  }
  function show(i, anim) {
    idx = (i % N + N) % N;
    track.style.transition = anim === false ? 'none' : '';
    track.style.transform = 'translateX(' + (-idx * 100) + '%)';
    count.textContent = (idx + 1) + ' / ' + N;
    load(idx); load(idx + 1); load(idx - 1);
  }
  function open(i) {
    lb.classList.add('open');
    document.body.style.overflow = 'hidden';
    show(i, false);
  }
  function close() {
    lb.classList.remove('open');
    document.body.style.overflow = '';
  }

  links.forEach(function (a, i) {
    a.addEventListener('click', function (e) { e.preventDefault(); open(i); });
  });
  lb.querySelector('.lb-close').addEventListener('click', close);
  lb.querySelector('.lb-prev').addEventListener('click', function () { show(idx - 1); });
  lb.querySelector('.lb-next').addEventListener('click', function () { show(idx + 1); });
  lb.addEventListener('click', function (e) {
    if (e.target === lb || e.target === vp) close();
  });
  document.addEventListener('keydown', function (e) {
    if (!lb.classList.contains('open')) return;
    if (e.key === 'Escape') close();
    else if (e.key === 'ArrowLeft') show(idx - 1);
    else if (e.key === 'ArrowRight') show(idx + 1);
  });

  // 터치 스와이프
  var x0 = null, dx = 0;
  vp.addEventListener('touchstart', function (e) {
    x0 = e.touches[0].clientX; dx = 0; track.style.transition = 'none';
  }, { passive: true });
  vp.addEventListener('touchmove', function (e) {
    if (x0 == null) return;
    dx = e.touches[0].clientX - x0;
    track.style.transform = 'translateX(calc(' + (-idx * 100) + '% + ' + dx + 'px))';
  }, { passive: true });
  vp.addEventListener('touchend', function () {
    track.style.transition = '';
    if (Math.abs(dx) > 50) show(idx + (dx < 0 ? 1 : -1));
    else show(idx);
    x0 = null; dx = 0;
  });
})();
