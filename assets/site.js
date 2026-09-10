/* 공간보감 — 포트폴리오 필터
   .filter[data-filter] 클릭 → data-filter 값과 일치하는 .case[data-tags] 만 표시.
   'all' 은 전체 표시. 일치 없으면 .no-result 노출. */
(function () {
  function initFilters() {
    var filters = document.querySelectorAll('.filter[data-filter]');
    var cases = document.querySelectorAll('.case[data-tags]');
    if (!filters.length || !cases.length) return;
    var empty = document.querySelector('.no-result');

    function apply(value) {
      var shown = 0;
      cases.forEach(function (c) {
        var tags = (c.getAttribute('data-tags') || '').split(/\s+/);
        var match = value === 'all' || tags.indexOf(value) !== -1;
        c.style.display = match ? '' : 'none';
        if (match) shown++;
      });
      if (empty) empty.style.display = shown ? 'none' : 'block';
    }

    filters.forEach(function (f) {
      f.addEventListener('click', function () {
        filters.forEach(function (x) { x.classList.remove('on'); });
        f.classList.add('on');
        apply(f.getAttribute('data-filter'));
      });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initFilters);
  } else {
    initFilters();
  }
})();

/* Portfolio card image fallback
   Keeps cards readable if a mapped portfolio image is missing or blocked. */
(function () {
  function initPortfolioImageFallbacks() {
    var imgs = document.querySelectorAll('.case-img img, .feature-img img, .portfolio-card img');
    imgs.forEach(function (img) {
      img.addEventListener('error', function () {
        var frame = img.closest('.case-img, .feature-img, .card-media');
        if (frame) frame.classList.add('is-fallback');
        img.removeAttribute('src');
        img.setAttribute('aria-hidden', 'true');
      }, { once: true });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initPortfolioImageFallbacks);
  } else {
    initPortfolioImageFallbacks();
  }
})();
