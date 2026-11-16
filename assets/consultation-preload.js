(function () {
  'use strict';
  // Only public static files, never an iframe, form data, analytics or apartment APIs.
  var jobs = new Map();
  var pageJobs = new Map();
  var queue = [];
  var active = 0;
  function allowed() {
    var connection = navigator.connection;
    return !document.hidden && !connection?.saveData &&
      !/(^|-)2g$/.test(connection?.effectiveType || '');
  }
  function pump() {
    while (active < 2 && queue.length) {
      var job = queue.shift();
      if (!allowed()) { jobs.delete(job.key); job.resolve(null); continue; }
      active++;
      (function (item) {
        var controller = new AbortController();
        var timer = setTimeout(function () { controller.abort(); }, 12000);
        fetch(item.url, { credentials: 'same-origin', cache: 'default', priority: 'low', redirect: 'error', signal: controller.signal })
          .then(function (response) {
            if (!response.ok || response.redirected || response.url && new URL(response.url).origin !== location.origin) throw new Error('Warmup unavailable');
            return item.html ? response.text() : response.arrayBuffer();
          }).then(item.resolve, function () { jobs.delete(item.key); item.resolve(null); })
          .finally(function () { clearTimeout(timer); active--; pump(); });
      })(job);
    }
  }
  function request(url, html) {
    var key = url.href;
    var saved = jobs.get(key);
    if (saved && Date.now() - saved.time < (html ? 60000 : 300000)) return saved.promise;
    var promise = new Promise(function (resolve) { queue.push({ key: key, url: url.href, html: html, resolve: resolve }); });
    jobs.set(key, { promise: promise, time: Date.now() });
    pump();
    return promise;
  }
  function coreResource(path) {
    return /^\/reports\/consultation-step-prototype-20260928\/(flow|consultation-questions)\.js$/.test(path) ||
      /^\/assets\/(kakao-consultation\.js|suit-fonts-[\w-]+\.css|consultation-help\.css|business-info\.css)$/.test(path);
  }
  function warmForm(url) {
    if (!allowed()) return Promise.resolve();
    url.hash = '';
    var previous = pageJobs.get(url.href);
    if (previous && Date.now() - previous.time < 60000) return previous.promise;
    var pending = request(url, true).then(function (html) {
      if (!html || !allowed()) return;
      var found = new Set();
      Array.from(html.matchAll(/<(?:script|link)\b[^>]*\b(?:src|href)=["']([^"']+)["'][^>]*>/gi)).forEach(function (match) {
        var asset;
        try { asset = new URL(match[1], url); } catch (_) { return; }
        if (asset.origin === location.origin && coreResource(asset.pathname)) found.add(asset.href);
      });
      return Promise.all(Array.from(found).slice(0, 8).map(function (asset) { return request(new URL(asset), false); }));
    }).catch(function () {}).finally(function () {
      // A failed/aborted document remains retryable on the next explicit intent.
      if (!jobs.has(url.href)) pageJobs.delete(url.href);
    });
    pageJobs.set(url.href, { promise: pending, time: Date.now() });
    return pending;
  }
  function target(anchor) {
    if (!anchor) return;
    var url;
    try { url = new URL(anchor.href, location.href); } catch (_) { return; }
    if (url.origin === location.origin && ['/consultation/', '/consultation/apply/'].includes(url.pathname)) warmForm(url);
  }
  function intent(event) { target(event.target.closest?.('a[href]')); }
  ['pointerover', 'focusin', 'pointerdown'].forEach(function (name) { document.addEventListener(name, intent, { passive: true }); });
  function idle() {
    var run = function () {
      if (!allowed()) return;
      var link = document.querySelector('a.v8-home-primary-cta[href], a.v8-consult[href]');
      if (link && link.getClientRects().length) target(link);
    };
    // Do not compete with initial page assets. Intent above can start sooner.
    setTimeout(function () {
      if ('requestIdleCallback' in window) requestIdleCallback(run, { timeout: 2000 });
      else setTimeout(run, 100);
    }, 2500);
  }
  if (document.readyState === 'complete') idle();
  else window.addEventListener('load', idle, { once: true });
})();
