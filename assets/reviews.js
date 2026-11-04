(function () {
  'use strict';
  var overview = document.querySelector('.rv-summary');
  if (overview) {
    var tools = document.createElement('details');
    tools.className = 'rv-browse-tools';
    var toggle = document.createElement('summary');
    toggle.textContent = '후기 검색·평점 통계';
    overview.before(tools);
    tools.append(toggle);
    ['.rv-tools', '.rv-summary', '.rv-summary-note', '.rv-distribution'].forEach(function (selector) {
      tools.append(document.querySelector(selector));
    });
    var mobile = matchMedia('(max-width:720px)');
    function adaptTools() { tools.open = !mobile.matches; }
    mobile.addEventListener('change', adaptTools);
    adaptTools();
  }
  var form = document.getElementById('review-form');
  if (!form) return;
  var status = document.getElementById('review-status');
  var submit = document.getElementById('review-submit');
  var ratingLabels = ['매우 아쉬웠어요', '아쉬웠어요', '보통이에요', '좋았어요', '매우 좋았어요'];
  var submissionKey, previousPayload;
  submit.disabled = false;
  var today = new Date();
  form.elements.experienceMonth.max = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0');
  function openWriter() {
    if (location.hash === '#write-review') document.getElementById('review-writing').open = true;
  }
  openWriter();
  window.addEventListener('hashchange', openWriter);
  form.addEventListener('change', function () {
    var rating = Number(form.elements.rating.value);
    form.querySelectorAll('.rv-rating-options label').forEach(function (label, index) {
      label.querySelector('[aria-hidden]').textContent = index < rating ? '★' : '☆';
    });
    document.getElementById('rating-description').textContent = rating ? rating + '점 · ' + ratingLabels[rating - 1] : '1점부터 5점까지 선택해 주세요.';
  });
  form.elements.body.addEventListener('input', function () {
    document.getElementById('review-character-count').textContent = form.elements.body.value.length.toLocaleString('ko-KR');
  });
  form.addEventListener('submit', async function (event) {
    event.preventDefault();
    if (submit.disabled || !form.reportValidity()) return;
    var data = Object.fromEntries(new FormData(form));
    data.rating = Number(data.rating);
    data.consent = form.elements.consent.checked;
    var payload = JSON.stringify(data);
    if (payload !== previousPayload) submissionKey = crypto.randomUUID();
    previousPayload = payload;
    submit.disabled = true;
    status.textContent = '후기를 접수하고 있습니다.';
    status.removeAttribute('data-error');
    try {
      var response = await fetch('/api/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': submissionKey },
        body: payload,
        signal: AbortSignal.timeout(20000)
      });
      var receipt = await response.json();
      if (!response.ok) throw new Error(response.status === 429 ? '접수가 잠시 많습니다. 잠시 후 다시 시도해 주세요.' : response.status >= 500 ? '접수 서버에 연결하지 못했습니다. 입력한 내용은 그대로 있으니 잠시 후 다시 시도해 주세요.' : receipt.error || '입력 내용을 확인해 주세요.');
      if (receipt.status !== 'received' || !receipt.id) throw new Error('접수 결과를 확인하지 못했습니다. 다시 시도해 주세요.');
      form.hidden = true;
      status.textContent = '후기가 접수되었습니다. 고객 확인과 개인정보 점검을 마치면 공개되며, 공개 후 평점 통계에 반영됩니다. 접수번호: ' + receipt.id;
      status.focus();
    } catch (error) {
      status.dataset.error = 'true';
      status.textContent = error.name === 'TimeoutError' || error.name === 'TypeError' ? '연결이 원활하지 않아 접수 결과를 확인하지 못했습니다. 같은 내용으로 다시 접수해도 중복 저장되지 않습니다.' : error.message;
      submit.disabled = false;
      status.focus();
    }
  });
})();
