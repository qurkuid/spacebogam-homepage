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

  document.querySelectorAll('[data-consultation-apply]').forEach(function (link) {
    link.href = '/consultation/apply/' + location.search + location.hash;
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
    rows.replaceChildren();
    try {
      var response = await fetch('https://intm.kr/api/consultation/list?public=true&companySlug=ggbg&page=' + page, { credentials: 'omit', cache: 'no-store', signal: AbortSignal.timeout(20000) });
      if (!response.ok) throw new Error('List unavailable');
      var data = await response.json();
      if (!Array.isArray(data.consultRequests)) throw new Error('Invalid list');
      if (currentRequest !== requestNumber) return;
      hasMore = data.hasMore === true;
      data.consultRequests.forEach(function (request) {
        var row = document.createElement('tr');
        var created = document.createElement('td');
        created.textContent = date.format(new Date(request.createdAt));
        var name = document.createElement('td');
        var button = document.createElement('button');
        button.type = 'button';
        button.className = 'board-request';
        button.textContent = request.name;
        button.setAttribute('aria-label', request.name + ' 상담 내용 보기');
        button.addEventListener('click', function (event) { event.stopPropagation(); openRequest(request.id); });
        name.append(button);
        var building = document.createElement('td');
        building.textContent = request.buildingName || '미입력';
        row.append(created, name, building);
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
