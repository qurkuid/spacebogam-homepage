(function () {
  'use strict';
  var table = document.getElementById('consultation-table');
  if (!table) return;
  var rows = document.getElementById('board-rows');
  var status = document.getElementById('board-status');
  var previous = document.getElementById('board-prev');
  var next = document.getElementById('board-next');
  var retry = document.getElementById('board-retry');
  var notice = document.getElementById('board-notice');
  var page = 1;
  var loading = false;
  var checking = false;
  var hasMore = false;
  var requestNumber = 0;
  var date = new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' });

  var application = document.getElementById('board-application');
  var frame = document.getElementById('board-application-frame');
  var applicationStatus = document.getElementById('board-application-status');
  var applicationRetry = document.getElementById('board-application-retry');
  var applyLinks = document.querySelectorAll('[data-consultation-apply]');
  var applicationTimer;
  var applicationReady = false;
  var lastApplyLink;
  var applicationWarmup;
  var stopApplicationWatching;
  function applicationUrl() {
    var url = new URL('/consultation/apply/' + location.search, location.origin);
    url.searchParams.set('embed', 'board');
    return url;
  }
  // Warm only public, same-origin files. Do not instantiate a hidden form:
  // that would emit form-view analytics for people who never open it.
  function warmApplication() {
    var connection = navigator.connection;
    if (applicationWarmup || frame.getAttribute('src') || document.hidden ||
        connection?.saveData || /(^|-)2g$/.test(connection?.effectiveType || '')) return;
    if (window.__sbConsultationPreload) {
      applicationWarmup = window.__sbConsultationPreload.form(applicationUrl().href)
        .finally(function () { applicationWarmup = null; });
      return;
    }
    applicationWarmup = fetch(applicationUrl().href, {
      credentials: 'same-origin', cache: 'force-cache', priority: 'low'
    }).then(function (response) {
      if (!response.ok) throw new Error('Application warmup unavailable');
      return response.text();
    }).then(function (html) {
      var sources = Array.from(html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["']/gi));
      var urls = new Set();
      sources.forEach(function (match) {
        var url = new URL(match[1], applicationUrl());
        if (url.origin === location.origin &&
            (/^\/reports\/consultation-step-prototype-20260928\/(flow|consultation-questions)\.js$/.test(url.pathname) ||
             /^\/assets\/(application-speed-[\w-]+|kakao-consultation)\.js$/.test(url.pathname))) urls.add(url.href);
      });
      return Promise.allSettled(Array.from(urls, function (url) {
        return fetch(url, { credentials: 'same-origin', cache: 'force-cache', priority: 'low' })
          .then(function (response) { return response.arrayBuffer(); });
      }));
    }).catch(function () { applicationWarmup = null; });
  }
  function scheduleApplicationWarmup() {
    if ('requestIdleCallback' in window) window.requestIdleCallback(warmApplication, { timeout: 2000 });
    else setTimeout(warmApplication, 500);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', scheduleApplicationWarmup, { once: true });
  else scheduleApplicationWarmup();
  function startApplication() {
    applicationReady = false;
    if (stopApplicationWatching) stopApplicationWatching();
    applicationStatus.hidden = false;
    applicationStatus.textContent = '신청서를 불러오고 있습니다.';
    applicationRetry.hidden = true;
    frame.hidden = false;
    frame.src = applicationUrl().href;
    clearTimeout(applicationTimer);
    applicationTimer = setTimeout(function () {
      if (applicationReady) return;
      applicationStatus.textContent = '신청서를 불러오지 못했습니다. 다시 시도해주세요.';
      applicationRetry.hidden = false;
    }, 20000);
  }
  applyLinks.forEach(function (link) {
    link.href = '/consultation/apply/' + location.search + location.hash;
    link.addEventListener('mouseenter', warmApplication, { once: true });
    link.addEventListener('focus', warmApplication, { once: true });
    link.addEventListener('click', function (event) {
      event.preventDefault();
      lastApplyLink = link;
      application.hidden = false;
      applyLinks.forEach(function (item) { item.setAttribute('aria-expanded', 'true'); });
      if (!frame.getAttribute('src')) startApplication();
      application.scrollIntoView({ block: 'start' });
      document.getElementById('board-application-title').focus({ preventScroll: true });
    });
  });
  document.getElementById('board-application-close').addEventListener('click', function () {
    application.hidden = true;
    applyLinks.forEach(function (item) { item.setAttribute('aria-expanded', 'false'); });
    if (lastApplyLink) lastApplyLink.focus();
    if (applicationReady && frame.contentDocument.querySelector('#next')?.hidden) load();
  });
  applicationRetry.addEventListener('click', startApplication);
  window.addEventListener('message', function (event) {
    if (event.origin !== location.origin || event.source !== frame.contentWindow || event.data?.type !== 'spacebogam-consultation-ready' || applicationReady) return;
    var doc = frame.contentDocument;
    if (!doc?.getElementById('stage')) return;
    applicationReady = true;
    clearTimeout(applicationTimer);
    applicationStatus.hidden = true;
    var lastStep = '';
    function resizeApplication() {
      if (application.hidden) return;
      var shell = doc.querySelector('.shell');
      var height = Math.max(400, Math.ceil(shell.getBoundingClientRect().height) + 8);
      if (frame.style.height !== height + 'px') frame.style.height = height + 'px';
      var step = doc.querySelector('.step-meta')?.textContent || '';
      if (lastStep && step !== lastStep) application.scrollIntoView({ block: 'start' });
      lastStep = step;
    }
    var resizeFrame = 0;
    function scheduleResize() {
      if (!resizeFrame) resizeFrame = requestAnimationFrame(function () {
        resizeFrame = 0;
        resizeApplication();
      });
    }
    var resizeObserver = new ResizeObserver(scheduleResize);
    var mutationObserver = new MutationObserver(scheduleResize);
    resizeObserver.observe(doc.querySelector('.shell'));
    mutationObserver.observe(doc.getElementById('stage'), { childList: true, subtree: true });
    stopApplicationWatching = function () {
      resizeObserver.disconnect();
      mutationObserver.disconnect();
      if (resizeFrame) cancelAnimationFrame(resizeFrame);
      stopApplicationWatching = null;
    };
    resizeApplication();
  });
  function message(title, text) {
    document.getElementById('board-notice-title').textContent = title;
    document.getElementById('board-notice-description').textContent = text;
    if (!notice.open) notice.showModal();
  }
  function openRequest(id) {
    if (checking) return;
    checking = true;
    var channel = crypto.randomUUID();
    var popup = window.open('https://intm.kr/consultation/board-access?requestId=' + encodeURIComponent(id) + '&channel=' + channel, '_blank', 'popup,width=600,height=780');
    if (!popup) {
      checking = false;
      message('관리자 확인', '관리자 권한을 확인하려면 이 사이트의 팝업을 허용한 뒤 다시 눌러주세요.');
      return;
    }
    var timeout, closed;
    function finish() {
      checking = false;
      clearTimeout(timeout);
      clearInterval(closed);
      window.removeEventListener('message', receive);
    }
    function receive(event) {
      if (event.origin !== 'https://intm.kr' || event.source !== popup || event.data?.type !== 'spacebogam-consultation-access' || event.data.channel !== channel) return;
      if (!['allowed', 'denied', 'error'].includes(event.data.status)) return;
      finish();
      if (event.data.status === 'denied') message('권한 없음', '상담 내용을 볼 권한이 없습니다. 관리자만 확인할 수 있습니다.');
      else if (event.data.status === 'error') message('연결 확인', '관리자 권한을 확인하지 못했습니다. 잠시 후 다시 시도해주세요.');
    }
    window.addEventListener('message', receive);
    timeout = setTimeout(function () {
      finish();
      popup.close();
      message('연결 확인', '관리자 확인 시간이 초과되었습니다. 잠시 후 다시 시도해주세요.');
    }, 30000);
    closed = setInterval(function () {
      if (popup.closed) {
        finish();
        message('관리자 확인', '관리자 확인 창이 닫혔습니다. 다시 눌러주세요.');
      }
    }, 1000);
  }
  function controls() {
    previous.disabled = loading || page === 1;
    next.disabled = loading || !hasMore;
    table.setAttribute('aria-busy', String(loading));
    document.getElementById('board-page').textContent = page + ' 페이지';
  }
  async function load() {
    var currentRequest = ++requestNumber;
    loading = true;
    controls();
    retry.hidden = true;
    status.removeAttribute('data-error');
    status.textContent = '상담 신청 내역을 불러오고 있습니다.';
    // Keep the current page in place while fetching the next one.
    try {
      var response = await fetch('https://intm.kr/api/consultation/list?public=true&companySlug=ggbg&page=' + page, { credentials: 'omit', cache: 'no-store', signal: AbortSignal.timeout(20000) });
      if (!response.ok) throw new Error('List unavailable');
      var data = await response.json();
      if (!Array.isArray(data.consultRequests)) throw new Error('Invalid list');
      if (currentRequest !== requestNumber) return;
      hasMore = data.hasMore === true;
      rows.replaceChildren();
      data.consultRequests.forEach(function (request) {
        var row = document.createElement('tr');
        var created = document.createElement('td');
        created.textContent = date.format(new Date(request.createdAt));
        var name = document.createElement('td');
        var button = document.createElement('button');
        button.type = 'button';
        button.className = 'board-request';
        var lock = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        lock.setAttribute('viewBox', '0 0 24 24');
        lock.setAttribute('class', 'board-lock');
        lock.setAttribute('aria-hidden', 'true');
        var lockPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        lockPath.setAttribute('d', 'M7 10V7a5 5 0 0 1 10 0v3M5 10h14v11H5zM12 14v3');
        lock.append(lockPath);
        button.append(lock, document.createTextNode(request.name));
        button.setAttribute('aria-label', request.name + ' 상담 내용 보기');
        button.addEventListener('click', function (event) { event.stopPropagation(); openRequest(request.id); });
        name.append(button);
        var building = document.createElement('td');
        building.textContent = request.buildingName || '미입력';
        var phone = document.createElement('td');
        phone.className = 'board-phone';
        phone.textContent = request.phone || '미입력';
        row.append(created, name, phone, building);
        row.addEventListener('click', function () { openRequest(request.id); });
        rows.append(row);
      });
      status.textContent = data.consultRequests.length ? '' : '상담 신청 내역이 없습니다.';
    } catch (_error) {
      if (currentRequest !== requestNumber) return;
      rows.replaceChildren();
      hasMore = false;
      status.dataset.error = 'true';
      status.textContent = '상담 신청 내역을 불러오지 못했습니다. 연결을 확인한 뒤 다시 시도해주세요.';
      retry.hidden = false;
    } finally {
      if (currentRequest === requestNumber) { loading = false; controls(); }
    }
  }
  previous.addEventListener('click', function () { if (!loading && page > 1) { page--; load(); } });
  next.addEventListener('click', function () { if (!loading && hasMore) { page++; load(); } });
  retry.addEventListener('click', load);
  load();
})();
