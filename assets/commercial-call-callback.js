/* CMP-1315 상업 상담 랜딩 — 연결 실패용 최소 콜백 폼
 *
 * 전화가 어려운 방문자를 위한 콜백 폼. 성함/연락처와 현장 주소/면적/계약 여부/
 * 공사 시작일을 필수로 받고, 나머지 정보는 선택 또는 기본값으로 받는다.
 * CMP-1312 재포지셔닝: 콜백은 담당자가
 * 전화드려 조건을 확인하고 대면상담 일정을 잡기 위한 요청이다 — 카피만
 * 그 프레임으로 쓰고, 제출 API·질문 ID·이벤트명 계약은 그대로 둔다. 주거형 28문항 상담폼(/consultation/apply/,
 * assets/consultation-form.js)과는 별도 화면·별도 스크립트이며 서로 링크하지 않는다
 * (CMP-1315: "주거형 28문항 폼 연결 금지"). 제출 자체는 intm 의 동일한 공개 상담
 * 접수 API(consult_req 가 정본 리드 테이블, /api/consultation/submit)로 보내되,
 * commercial_callback 유형과 최소 전용 payload 를 명시하고 질문 3개만 채운다 —
 * 2026-08-22 GET /api/consultation/questions 실측 기준 ID:
 *   13 = 성함, 10 = 연락처, 17 = 통화 가능한 시간대(선택형, 선택)
 * 서버는 최소 payload 를 검증해 consult_req 필드를 채우고 answers 에 담은 위 세 답변도
 * consult_answers 에 보존한다 — 28문항을 전부 채울 필요가 없다. 나머지 25개 질문은
 * 이 폼에 아예 존재하지 않는다.
 *
 * funnel-tracking.js 가 이 페이지에서 먼저 로드되어 clientId/sessionId/attribution/
 * is_test 를 localStorage·sessionStorage 에 채워둔다. 여기서는 같은 키를 읽기만
 * 하고 새로 만들지 않는다 — 새로 만들면 이 폼 제출이 phone_click 등 같은 세션의
 * 다른 이벤트와 이어지지 않는다(CMP-160 과 동일한 함정).
 *
 * 이벤트 이름은 intm DB CHECK 제약(spacebogam_funnel_events_event_name_check)에
 * 이미 있는 lead_form_view / lead_form_start / lead_submit_success 만 쓴다. 새
 * 이름을 추가로 보내면 마이그레이션 전엔 전량 400 이 된다.
 */
(function(){
  'use strict';

  var root = document.getElementById('cc-callback-root');
  if (!root) return;

  var API_ORIGIN = 'https://intm.kr';
  var SUBMIT_URL = API_ORIGIN + '/api/consultation/submit';
  var FUNNEL_URL = API_ORIGIN + '/api/marketing/funnel-events';
  var COMPANY_ID = '4206bdfd-b51d-4433-9f8e-c854131948cc';

  var CLIENT_KEY = 'spacebogam_funnel_client_id';
  var SESSION_KEY = 'spacebogam_funnel_session_id';
  var ATTRIBUTION_KEY = 'spacebogam_funnel_attribution';
  var TEST_SESSION_KEY = 'spacebogam_funnel_is_test';
  var EVENT_IDS_KEY = 'spacebogam.commercialCallCallback.eventIds.v1';

  var NAME_QUESTION_ID = '13';
  var PHONE_QUESTION_ID = '10';
  var CALLBACK_TIME_QUESTION_ID = '17';
  var CALLBACK_TIME_OPTIONS = ['오전 (9시~12시)', '오후 (12시~18시)', '저녁 (18시~21시)'];
  var CALLBACK_VERTICALS = ['office', 'shop'];
  var CALLBACK_BUDGET_OPTIONS = [
    {value: 'under_30m', label: '3천만원 미만'},
    {value: '30_50m', label: '3천만~5천만원'},
    {value: '50_100m', label: '5천만~1억원'},
    {value: '100_200m', label: '1억~2억원'},
    {value: 'over_200m', label: '2억원 이상'},
    {value: 'undecided', label: '미정'}
  ];
  var LEASE_STATUS_OPTIONS = [
    {value: 'leased', label: '임대차 계약 완료'},
    {value: 'deposit_paid', label: '계약금 납부 완료'},
    {value: 'negotiating', label: '계약 협의 중'},
    {value: 'viewing', label: '매물 확인 중'},
    {value: 'owned', label: '자가 소유'}
  ];
  var CONSENT_ANSWER_ID = '9999';
  var EXPERIMENT_ID = 'homepage_headline_v1';

  var QUERY_ATTRIBUTION_KEYS = [
    'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term',
    'gclid', 'gbraid', 'wbraid', 'fbclid', 'msclkid',
    'n_keyword', 'n_query', 'n_campaign_type', 'n_ad_group', 'n_keyword_id',
    'utm_id', 'campaign_id', 'adset_id', 'ad_id', 'asset_id'
  ];
  var UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  function uuid(){
    if (window.crypto && typeof window.crypto.randomUUID === 'function') return window.crypto.randomUUID();
    var bytes = new Uint8Array(16);
    if (window.crypto && window.crypto.getRandomValues) window.crypto.getRandomValues(bytes);
    else for (var i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
    bytes[6] = (bytes[6] & 15) | 64;
    bytes[8] = (bytes[8] & 63) | 128;
    var hex = Array.prototype.map.call(bytes, function(b){ return b.toString(16).padStart(2, '0'); });
    return hex.slice(0, 4).join('') + '-' + hex.slice(4, 6).join('') + '-' +
      hex.slice(6, 8).join('') + '-' + hex.slice(8, 10).join('') + '-' + hex.slice(10, 16).join('');
  }

  function storage(name){ try { return window[name]; } catch(e) { return null; } }
  var local = storage('localStorage');
  var session = storage('sessionStorage');

  function storedId(store, key){
    if (!store) return uuid();
    try {
      var value = store.getItem(key);
      if (value) return value;
      value = uuid();
      store.setItem(key, value);
      return value;
    } catch(e) { return uuid(); }
  }

  var clientId = storedId(local, CLIENT_KEY);
  var sessionId = storedId(session, SESSION_KEY);
  var params = new URLSearchParams(location.search);

  function commercialVertical(){
    // 광고 URL의 정본 키와 QA용 단축 키를 모두 지원한다. commercial-call.js가
    // utm_content에서 판별해 body에 기록한 값도 받아 두 스크립트의 업종이 어긋나지 않게 한다.
    var queryVertical = (params.get('vertical') || params.get('commercial_vertical') || '').trim().toLowerCase();
    if (CALLBACK_VERTICALS.indexOf(queryVertical) !== -1) return queryVertical;
    var renderedVertical = ((document.body && document.body.getAttribute('data-commercial-vertical')) || '').trim().toLowerCase();
    return CALLBACK_VERTICALS.indexOf(renderedVertical) !== -1 ? renderedVertical : 'office';
  }

  function isTestTraffic(){
    var truthy = ['1', 'true', 'yes', 'y', 'on'];
    var fromQuery = truthy.indexOf((params.get('is_test') || '').trim().toLowerCase()) !== -1;
    if (fromQuery) return true;
    try { return session && session.getItem(TEST_SESSION_KEY) === 'true'; } catch(e) { return false; }
  }
  var isTest = isTestTraffic();

  function storedAttribution(){
    try {
      var stored = local ? JSON.parse(local.getItem(ATTRIBUTION_KEY) || 'null') : null;
      if (stored && stored.expiresAt > Date.now() && stored.values) return stored.values;
    } catch(e) {}
    return {};
  }
  var fallbackAttribution = storedAttribution();

  function attributionValue(key){
    var current = (params.get(key) || '').trim();
    return current || (fallbackAttribution[key] || '');
  }

  function deviceType(){
    if (window.innerWidth < 768) return 'mobile';
    if (window.innerWidth < 1024) return 'tablet';
    return 'desktop';
  }

  function storedEventIds(){
    var fresh = { lead_form_view: uuid(), lead_form_start: uuid(), lead_submit_success: uuid() };
    if (!session) return fresh;
    try {
      var stored = JSON.parse(session.getItem(EVENT_IDS_KEY) || 'null');
      if (stored &&
        UUID_PATTERN.test(stored.lead_form_view || '') &&
        UUID_PATTERN.test(stored.lead_form_start || '') &&
        UUID_PATTERN.test(stored.lead_submit_success || '')) return stored;
      session.setItem(EVENT_IDS_KEY, JSON.stringify(fresh));
    } catch(e) {}
    return fresh;
  }
  var eventIds = storedEventIds();

  function sendFunnelEvent(eventName){
    var payload = {
      eventId: eventIds[eventName] || uuid(),
      clientId: clientId,
      sessionId: sessionId,
      eventName: eventName,
      pagePath: location.pathname,
      pageTitle: document.title,
      occurredAt: new Date().toISOString(),
      utmSource: attributionValue('utm_source'),
      utmMedium: attributionValue('utm_medium'),
      utmCampaign: attributionValue('utm_campaign'),
      utmContent: attributionValue('utm_content'),
      utmTerm: attributionValue('utm_term'),
      experimentId: EXPERIMENT_ID,
      experimentVariant: '',
      ctaLocation: 'commercial_call_callback_form',
      ctaText: '',
      // CMP-1315 콜백 폼 제출을 홈 A/B 버킷과 구분하는 표식. funnelEventInputSchema
      // 는 자유 텍스트라 새 값을 추가해도 400 이 나지 않는다(enum 이 걸린 건 eventName 뿐).
      pageVariant: 'commercial_call_callback_v1',
      deviceType: deviceType(),
      isTest: isTest
    };
    fetch(FUNNEL_URL, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(payload),
      keepalive: true
    }).catch(function(){});
  }

  function el(tag, className, text){
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function option(value, label){
    var node = document.createElement('option');
    node.value = value;
    node.textContent = label;
    return node;
  }

  var viewSent = false;
  function trackView(){
    if (viewSent) return;
    viewSent = true;
    sendFunnelEvent('lead_form_view');
  }

  var startSent = false;
  function trackStart(){
    if (startSent) return;
    startSent = true;
    sendFunnelEvent('lead_form_start');
  }

  function renderForm(){
    var form = el('form', 'cc-callback-form');
    form.setAttribute('novalidate', 'novalidate');

    var nameField = el('div', 'cc-field');
    var nameLabel = el('label', 'cc-label', '성함 ');
    nameLabel.appendChild(el('span', 'cc-required', '*'));
    var nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.className = 'cc-input';
    nameInput.id = 'cc-callback-name';
    nameInput.autocomplete = 'name';
    nameInput.maxLength = 60;
    nameLabel.setAttribute('for', nameInput.id);
    nameField.appendChild(nameLabel);
    nameField.appendChild(nameInput);
    form.appendChild(nameField);

    var phoneField = el('div', 'cc-field');
    var phoneLabel = el('label', 'cc-label', '연락처 ');
    phoneLabel.appendChild(el('span', 'cc-required', '*'));
    var phoneInput = document.createElement('input');
    phoneInput.type = 'tel';
    phoneInput.className = 'cc-input';
    phoneInput.id = 'cc-callback-phone';
    phoneInput.autocomplete = 'tel';
    phoneInput.placeholder = '010-0000-0000';
    phoneInput.maxLength = 20;
    phoneLabel.setAttribute('for', phoneInput.id);
    phoneField.appendChild(phoneLabel);
    phoneField.appendChild(phoneInput);
    form.appendChild(phoneField);

    function requiredInput(id, labelText, type, placeholder, maxLength){
      var field = el('div', 'cc-field');
      var label = el('label', 'cc-label', labelText + ' ');
      label.appendChild(el('span', 'cc-required', '*'));
      var input = document.createElement('input');
      input.type = type;
      input.className = 'cc-input';
      input.id = id;
      input.required = true;
      if (placeholder) input.placeholder = placeholder;
      if (maxLength) input.maxLength = maxLength;
      label.setAttribute('for', id);
      field.appendChild(label);
      field.appendChild(input);
      form.appendChild(field);
      return input;
    }

    var addressInput = requiredInput('cc-callback-address', '현장 주소', 'text', '예: 부산 해운대구', 200);
    addressInput.autocomplete = 'street-address';
    var areaInput = requiredInput('cc-callback-area', '평수/면적', 'text', '예: 30평 또는 99㎡', 60);

    var leaseStatusField = el('div', 'cc-field');
    var leaseStatusLabel = el('label', 'cc-label', '계약 여부 ');
    leaseStatusLabel.appendChild(el('span', 'cc-required', '*'));
    var leaseStatusSelect = document.createElement('select');
    leaseStatusSelect.className = 'cc-input cc-select';
    leaseStatusSelect.id = 'cc-callback-lease-status';
    leaseStatusSelect.required = true;
    leaseStatusSelect.appendChild(option('', '계약 상태를 선택해주세요'));
    LEASE_STATUS_OPTIONS.forEach(function(item){ leaseStatusSelect.appendChild(option(item.value, item.label)); });
    leaseStatusLabel.setAttribute('for', leaseStatusSelect.id);
    leaseStatusField.appendChild(leaseStatusLabel);
    leaseStatusField.appendChild(leaseStatusSelect);
    form.appendChild(leaseStatusField);

    var constructionStartDateInput = requiredInput(
      'cc-callback-construction-start-date', '공사 시작일', 'date', '', 0
    );

    var verticalField = el('div', 'cc-field');
    var verticalLabel = el('label', 'cc-label', '업종');
    var verticalSelect = document.createElement('select');
    verticalSelect.className = 'cc-input cc-select';
    verticalSelect.id = 'cc-callback-vertical';
    verticalSelect.appendChild(option('office', '사무실'));
    verticalSelect.appendChild(option('shop', '일반상가'));
    verticalSelect.value = commercialVertical();
    verticalLabel.setAttribute('for', verticalSelect.id);
    verticalField.appendChild(verticalLabel);
    verticalField.appendChild(verticalSelect);
    form.appendChild(verticalField);

    var budgetField = el('div', 'cc-field');
    var budgetLabel = el('label', 'cc-label', '예산');
    var budgetSelect = document.createElement('select');
    budgetSelect.className = 'cc-input cc-select';
    budgetSelect.id = 'cc-callback-budget';
    CALLBACK_BUDGET_OPTIONS.forEach(function(item){
      budgetSelect.appendChild(option(item.value, item.label));
    });
    budgetSelect.value = 'undecided';
    budgetLabel.setAttribute('for', budgetSelect.id);
    budgetField.appendChild(budgetLabel);
    budgetField.appendChild(budgetSelect);
    form.appendChild(budgetField);

    var timeField = el('div', 'cc-field');
    timeField.appendChild(el('span', 'cc-label', '통화 가능한 시간대(선택)'));
    var timeChoices = el('div', 'cc-choices');
    CALLBACK_TIME_OPTIONS.forEach(function(option, index){
      var choice = el('label', 'cc-choice');
      var radio = document.createElement('input');
      radio.type = 'radio';
      radio.name = 'cc-callback-time';
      radio.value = option;
      radio.id = 'cc-callback-time-' + index;
      choice.appendChild(radio);
      choice.appendChild(document.createTextNode(option));
      timeChoices.appendChild(choice);
    });
    timeField.appendChild(timeChoices);
    form.appendChild(timeField);

    var details = el('details', 'cc-callback-details');
    details.appendChild(el('summary', 'cc-callback-details-summary', '추가 정보 입력하기 (선택)'));
    var detailsBody = el('div', 'cc-callback-details-body');

    function detailInput(id, labelText, type, placeholder, maxLength){
      var field = el('div', 'cc-field');
      var label = el('label', 'cc-label', labelText + ' (선택)');
      var input = document.createElement('input');
      input.type = type;
      input.className = 'cc-input';
      input.id = id;
      if (placeholder) input.placeholder = placeholder;
      if (maxLength) input.maxLength = maxLength;
      label.setAttribute('for', id);
      field.appendChild(label);
      field.appendChild(input);
      detailsBody.appendChild(field);
      return input;
    }

    var openDateInput = detailInput('cc-callback-open-date', '오픈 희망일', 'date', '', 0);

    var noteField = el('div', 'cc-field');
    var noteLabel = el('label', 'cc-label', '추가 요청사항 (선택)');
    var requestNoteInput = document.createElement('textarea');
    requestNoteInput.className = 'cc-input cc-textarea';
    requestNoteInput.id = 'cc-callback-request-note';
    requestNoteInput.rows = 3;
    requestNoteInput.maxLength = 1000;
    requestNoteInput.placeholder = '미리 알려주실 내용이 있다면 적어주세요.';
    noteLabel.setAttribute('for', requestNoteInput.id);
    noteField.appendChild(noteLabel);
    noteField.appendChild(requestNoteInput);
    detailsBody.appendChild(noteField);
    details.appendChild(detailsBody);
    form.appendChild(details);

    var consentWrap = el('div', 'cc-consent');
    var consentLabel = el('label', 'cc-choice');
    var consentInput = document.createElement('input');
    consentInput.type = 'checkbox';
    consentInput.id = 'cc-callback-consent';
    consentLabel.appendChild(consentInput);
    consentLabel.appendChild(document.createTextNode(
      '개인정보 수집·이용에 동의합니다. (상담 콜백 및 대면상담 일정 안내 목적, 상담 종료 후 파기)'
    ));
    consentWrap.appendChild(consentLabel);
    form.appendChild(consentWrap);

    var status = el('p', 'cc-callback-status');
    status.setAttribute('role', 'status');
    form.appendChild(status);

    var submit = el('button', 'cc-secondary cc-callback-submit', '콜백으로 대면상담 잡기');
    submit.type = 'submit';
    form.appendChild(submit);

    form.addEventListener('input', trackStart);
    form.addEventListener('change', trackStart);

    form.addEventListener('submit', function(event){
      event.preventDefault();
      status.textContent = '';
      status.classList.remove('cc-status-error');
      nameInput.removeAttribute('aria-invalid');
      phoneInput.removeAttribute('aria-invalid');
      addressInput.removeAttribute('aria-invalid');
      areaInput.removeAttribute('aria-invalid');
      leaseStatusSelect.removeAttribute('aria-invalid');
      constructionStartDateInput.removeAttribute('aria-invalid');
      consentInput.removeAttribute('aria-invalid');

      var name = nameInput.value.trim();
      var phone = phoneInput.value.trim();
      var checkedTime = form.querySelector('input[name="cc-callback-time"]:checked');
      var vertical = CALLBACK_VERTICALS.indexOf(verticalSelect.value) !== -1 ? verticalSelect.value : commercialVertical();
      var budget = CALLBACK_BUDGET_OPTIONS.some(function(item){ return item.value === budgetSelect.value; }) ?
        budgetSelect.value : 'undecided';
      var address = addressInput.value.trim();
      var area = areaInput.value.trim();
      var leaseStatus = LEASE_STATUS_OPTIONS.some(function(item){ return item.value === leaseStatusSelect.value; }) ?
        leaseStatusSelect.value : '';
      var constructionStartDate = constructionStartDateInput.value;

      if (!name) {
        status.textContent = '성함을 입력해주세요.';
        status.classList.add('cc-status-error');
        nameInput.setAttribute('aria-invalid', 'true');
        nameInput.focus();
        return;
      }
      if (!phone) {
        status.textContent = '연락처를 입력해주세요.';
        status.classList.add('cc-status-error');
        phoneInput.setAttribute('aria-invalid', 'true');
        phoneInput.focus();
        return;
      }
      if (!address) {
        status.textContent = '현장 주소를 입력해주세요.';
        status.classList.add('cc-status-error');
        addressInput.setAttribute('aria-invalid', 'true');
        addressInput.focus();
        return;
      }
      if (!area) {
        status.textContent = '평수/면적을 입력해주세요.';
        status.classList.add('cc-status-error');
        areaInput.setAttribute('aria-invalid', 'true');
        areaInput.focus();
        return;
      }
      if (!leaseStatus) {
        status.textContent = '계약 여부를 선택해주세요.';
        status.classList.add('cc-status-error');
        leaseStatusSelect.setAttribute('aria-invalid', 'true');
        leaseStatusSelect.focus();
        return;
      }
      if (!constructionStartDate) {
        status.textContent = '공사 시작일을 선택해주세요.';
        status.classList.add('cc-status-error');
        constructionStartDateInput.setAttribute('aria-invalid', 'true');
        constructionStartDateInput.focus();
        return;
      }
      if (!consentInput.checked) {
        status.textContent = '개인정보 수집·이용 동의가 필요합니다.';
        status.classList.add('cc-status-error');
        consentInput.setAttribute('aria-invalid', 'true');
        consentInput.focus();
        return;
      }

      var answers = {};
      answers[NAME_QUESTION_ID] = name;
      answers[PHONE_QUESTION_ID] = phone;
      if (checkedTime) answers[CALLBACK_TIME_QUESTION_ID] = checkedTime.value;
      answers[CONSENT_ANSWER_ID] = 'true';

      var marketingAttribution = {
        form_path: location.pathname,
        submitted_at: new Date().toISOString(),
        device_type: deviceType(),
        source_page: location.pathname,
        landing_page: '',
        referrer: document.referrer || '',
        experiment_id: EXPERIMENT_ID,
        experiment_variant: '',
        page_variant: 'commercial_call_callback_v1',
        sbClientId: clientId,
        sbSessionId: sessionId,
        sbSubmitEventId: eventIds.lead_submit_success
      };
      QUERY_ATTRIBUTION_KEYS.forEach(function(key){
        marketingAttribution[key] = attributionValue(key);
      });
      marketingAttribution.is_test = isTest ? 'true' : '';

      submit.disabled = true;
      submit.textContent = '접수 중…';

      fetch(SUBMIT_URL, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          type: 'commercial_callback',
          commercialCallback: {
            name: name,
            phone: phone,
            vertical: vertical,
            budget: budget,
            callbackTime: checkedTime ? checkedTime.value : '',
            address: address,
            area: area,
            leaseStatus: leaseStatus,
            constructionStartDate: constructionStartDate,
            openDate: openDateInput.value,
            requestNote: requestNoteInput.value.trim(),
            consent: consentInput.checked
          },
          answers: answers,
          filePath: null,
          companyId: COMPANY_ID,
          marketingAttribution: marketingAttribution
        })
      }).then(function(response){
        return response.json().catch(function(){ return {}; }).then(function(body){
          return {ok: response.ok, status: response.status, body: body};
        });
      }).then(function(result){
        if (!result.ok || !result.body || result.body.success !== true) {
          throw new Error((result.body && result.body.error) || ('HTTP ' + result.status));
        }
        renderSuccess();
      }).catch(function(error){
        submit.disabled = false;
        submit.textContent = '콜백으로 대면상담 잡기';
        status.textContent = '접수에 실패했습니다. 잠시 후 다시 시도하시거나 전화로 문의해주세요. (' +
          ((error && error.message) || 'network error') + ')';
        status.classList.add('cc-status-error');
      });
    });

    root.innerHTML = '';
    root.appendChild(form);
    trackView();
  }

  function renderSuccess(){
    root.innerHTML = '';
    var box = el('div', 'cc-callback-success');
    box.appendChild(el('p', 'cc-callback-success-title', '콜백 요청이 접수되었습니다.'));
    box.appendChild(el('p', 'cc-note', '남겨주신 연락처로 담당자가 전화드려 조건을 확인하고, 대면상담 일정을 함께 잡아드립니다.'));
    root.appendChild(box);
    sendFunnelEvent('lead_submit_success');
    try { if (session) session.removeItem(EVENT_IDS_KEY); } catch(e) {}
  }

  renderForm();
})();
