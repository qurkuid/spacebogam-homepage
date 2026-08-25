/**
 * CMP-173 — spacebogam.kr 도메인 안에서 완결되는 상담 신청 폼.
 *
 * 대표 지시: "공간보감 페이지에, intm의 api만 활용해서 상담신청 페이지를 새롭게 만들고
 * 필요한 추적코드를 넣을것." UI 는 공간보감이 소유하고 제출만 intm API 로 보낸다.
 * intm.kr 로 넘기던 리다이렉트가 사라지므로, 그 경계에서 새던 귀속을 신경 쓸 필요가 없다.
 *
 * 계측 계약은 CMP-151 / CMP-156 에서 이미 굳은 것을 그대로 쓴다. 새로 설계하지 않는다.
 *  - 플랫폼 식별자 5종(utm_id/campaign_id/adset_id/ad_id/asset_id)을 손실 없이 전달
 *  - Pixel Lead 의 eventID 와 서버가 저장하는 lead_event_id 를 같은 UUID 로 공유
 *  - is_test 를 그대로 전파해 QA 유입이 실적으로 집계되지 않게 한다
 *  - clientId/sessionId 는 funnel-tracking.js 가 쓰는 저장소 키를 재사용한다.
 *    새로 만들면 클릭 이벤트와 상담 건이 이어지지 않는다(CMP-160).
 */
(function(){
  var API_ORIGIN = 'https://intm.kr';
  var QUESTIONS_URL = API_ORIGIN + '/api/consultation/questions';
  var SUBMIT_URL = API_ORIGIN + '/api/consultation/submit';
  var FUNNEL_URL = API_ORIGIN + '/api/marketing/funnel-events';
  // 공간보감(ggbg)의 business_entities.id. 서버는 슬러그를 받지 않는다 — 슬러그를 보내면 500.
  var COMPANY_ID = '4206bdfd-b51d-4433-9f8e-c854131948cc';
  var META_PIXEL_ID = '512750840350337';
  var EXPERIMENT_ID = 'homepage_headline_v1';
  // 전 페이지 공통 페이지뷰 스니펫(tools/inject_naver_wcs.py)과 같은 wa 값.
  var NAVER_WCS_ID = 's_7702568df18';
  // CMP-1244(네이버 검색광고 프리미엄 로그분석 연동)에서 실제 전환유형 코드를 받으면 채운다.
  var NAVER_CONV_TYPE = '';

  // funnel-tracking.js 와 반드시 같은 키여야 한다.
  var CLIENT_KEY = 'spacebogam_funnel_client_id';
  var SESSION_KEY = 'spacebogam_funnel_session_id';
  var ATTRIBUTION_KEY = 'spacebogam_funnel_attribution';
  var FIRST_TOUCH_ATTRIBUTION_KEY = 'spacebogam_funnel_first_touch_attribution';
  var JOURNEY_KEY = 'spacebogam_funnel_journey';
  var EXPERIMENT_KEY = 'spacebogam_homepage_headline_v1_variant';
  var ATTRIBUTION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
  // lead 단계 event_id 는 세션 내내 고정이어야 한다. 새로 뽑으면 새로고침마다 폼 조회가
  // 중복 집계되고, 무엇보다 lead_submit_success 는 서버 recordSubmittedLead 가
  // sbSubmitEventId 로 같은 행을 쓰기 때문에 id 가 다르면 원장에 두 건이 남는다.
  var EVENT_IDS_KEY = 'spacebogam.consultationApply.eventIds.v1';
  var UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  // 개인정보 동의는 질문 테이블이 아니라 고정 id 로 실린다.
  var CONSENT_ANSWER_ID = '9999';

  var PLATFORM_ID_KEYS = ['utm_id', 'campaign_id', 'adset_id', 'ad_id', 'asset_id'];
  // 서버 sanitizeMarketingAttribution 허용목록 중 URL 에서 그대로 받아 넘기는 것들.
  // 목록에 없는 키는 저장 직전 조용히 폐기되므로 임의로 늘리지 않는다.
  var QUERY_ATTRIBUTION_KEYS = [
    'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term',
    'gclid', 'gbraid', 'wbraid', 'fbclid', 'msclkid',
    'n_keyword', 'n_query', 'n_campaign_type', 'n_ad_group', 'n_keyword_id'
  ].concat(PLATFORM_ID_KEYS);
  var STATIC_CHANNEL_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'];
  var SELF_REFERRAL_SOURCE = 'spacebogam.kr';
  var TEST_TRAFFIC_KEY = 'is_test';
  var TEST_TRUTHY = ['1', 'true', 'yes', 'y', 'on'];

  var params = new URLSearchParams(location.search);
  var root = document.getElementById('consult-form-root');
  if (!root) return;

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

  function storage(name){
    try { return window[name]; } catch(e) { return null; }
  }
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

  function storedEventIds(){
    var fresh = {
      lead_form_view: uuid(),
      lead_form_start: uuid(),
      lead_submit_success: uuid()
    };
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
  var submitEventId = eventIds.lead_submit_success;

  function isTestTraffic(){
    var value = (params.get(TEST_TRAFFIC_KEY) || '').trim().toLowerCase();
    return TEST_TRUTHY.indexOf(value) !== -1;
  }
  var isTest = isTestTraffic();

  function deviceType(){
    if (window.innerWidth < 768) return 'mobile';
    if (window.innerWidth < 1024) return 'tablet';
    return 'desktop';
  }

  /**
   * 광고 클릭은 홈에 떨어지고 폼은 그 다음 페이지다. 현재 URL 에 파라미터가 없으면
   * funnel-tracking.js / site-tracking.js 가 30일 보관하는 전체 스냅샷에서 되살린다.
   * 예전 {values, expiresAt} 저장 형식도 그대로 읽는다.
   */
  function readStoredAttribution(key){
    if (!local) return null;
    try {
      var stored = JSON.parse(local.getItem(key) || 'null');
      if (stored && stored.expiresAt > Date.now() && stored.values) return stored.values;
    } catch(error) {}
    return null;
  }

  function writeStoredAttribution(key, values){
    if (!local) return;
    try {
      local.setItem(key, JSON.stringify({
        values: values,
        expiresAt: Date.now() + ATTRIBUTION_TTL_MS
      }));
    } catch(error) {}
  }

  function hasAttribution(values){
    if (!values) return false;
    for (var i = 0; i < QUERY_ATTRIBUTION_KEYS.length; i++) {
      if (values[QUERY_ATTRIBUTION_KEYS[i]]) return true;
    }
    return false;
  }

  function isCampaignAttribution(values){
    if (!values) return false;
    var source = (values.utm_source || '').trim().toLowerCase();
    if (source && source !== SELF_REFERRAL_SOURCE) return true;
    for (var i = 0; i < PLATFORM_ID_KEYS.length; i++) {
      if (values[PLATFORM_ID_KEYS[i]]) return true;
    }
    for (var j = 0; j < QUERY_ATTRIBUTION_KEYS.length; j++) {
      var key = QUERY_ATTRIBUTION_KEYS[j];
      if (STATIC_CHANNEL_KEYS.indexOf(key) !== -1) continue;
      if (values[key]) return true;
    }
    return false;
  }

  function currentQueryAttribution(){
    var values = {};
    QUERY_ATTRIBUTION_KEYS.forEach(function(key){
      var value = (params.get(key) || '').trim();
      if (value) values[key] = value;
    });
    return values;
  }

  function resolveFirstTouchAttribution(legacyAttribution){
    var firstTouch = readStoredAttribution(FIRST_TOUCH_ATTRIBUTION_KEY);
    if (firstTouch && hasAttribution(firstTouch)) return firstTouch;

    var current = currentQueryAttribution();
    if (hasAttribution(current) && isCampaignAttribution(current)) {
      writeStoredAttribution(FIRST_TOUCH_ATTRIBUTION_KEY, current);
      return current;
    }
    if (legacyAttribution && hasAttribution(legacyAttribution) && isCampaignAttribution(legacyAttribution)) {
      writeStoredAttribution(FIRST_TOUCH_ATTRIBUTION_KEY, legacyAttribution);
      return legacyAttribution;
    }
    return {};
  }

  function storedAttribution(){
    try {
      var stored = readStoredAttribution(ATTRIBUTION_KEY);
      if (stored) return stored;
    } catch(e) {}
    return {};
  }

  function storedJourney(){
    var fallback = {
      landing_page: params.get('landing_page') || location.href,
      referrer: params.get('referrer') || document.referrer || ''
    };
    if (!session) return fallback;
    try {
      var stored = JSON.parse(session.getItem(JOURNEY_KEY) || 'null');
      if (stored && stored.landing_page) return stored;
    } catch(e) {}
    return fallback;
  }

  function boundedPath(value){
    try {
      return new URL(value || location.pathname, location.href).pathname.slice(0, 1000);
    } catch(e) {
      return location.pathname.slice(0, 1000);
    }
  }

  function experimentVariant(){
    try {
      var value = (session && session.getItem(EXPERIMENT_KEY) || '').toUpperCase();
      return value === 'A' || value === 'B' ? value : '';
    } catch(e) { return ''; }
  }

  var fallbackAttribution = storedAttribution();
  var journey = storedJourney();
  var currentIsSelfReferral = params.get('utm_source') === SELF_REFERRAL_SOURCE;
  var firstTouchAttribution = resolveFirstTouchAttribution(fallbackAttribution);
  var hasFirstTouchAttribution = hasAttribution(firstTouchAttribution);
  currentIsSelfReferral = currentIsSelfReferral && hasFirstTouchAttribution;

  function attributionValue(key){
    var current = (params.get(key) || '').trim();
    if (currentIsSelfReferral) return firstTouchAttribution[key] || '';
    if (!current && hasFirstTouchAttribution) return firstTouchAttribution[key] || '';
    return current || (fallbackAttribution[key] || '');
  }

  function marketingAttribution(){
    var attribution = {
      form_path: location.pathname,
      submitted_at: new Date().toISOString(),
      device_type: deviceType(),
      source_page: boundedPath(params.get('source_page')),
      landing_page: String(journey.landing_page || '').slice(0, 1000),
      referrer: String(journey.referrer || '').slice(0, 1000),
      experiment_id: EXPERIMENT_ID,
      experiment_variant: experimentVariant(),
      page_variant: params.get('page_variant') || '',
      sbClientId: clientId,
      sbSessionId: sessionId,
      // 서버는 이 값을 그대로 lead_event_id 로 재사용하고 leadEventId 로 되돌려준다.
      sbSubmitEventId: submitEventId
    };
    QUERY_ATTRIBUTION_KEYS.forEach(function(key){
      attribution[key] = attributionValue(key);
    });
    attribution[TEST_TRAFFIC_KEY] = isTest ? 'true' : '';
    return attribution;
  }

  function sendFunnelEvent(eventName, detail){
    var payload = {
      // lead_* 세 단계는 세션 고정 id 를 쓴다. 특히 lead_submit_success 는 서버가
      // 같은 id 로 이미 한 행을 쓰므로, 다른 id 를 보내면 dedup 되지 않고 두 건이 된다.
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
      // 수신 스키마는 .strict() 라 snake_case 별칭을 섞으면 전량 400 이 된다(CMP-141).
      experimentId: EXPERIMENT_ID,
      experimentVariant: experimentVariant(),
      ctaLocation: (detail && detail.ctaLocation) || '',
      ctaText: (detail && detail.ctaText) || '',
      pageVariant: params.get('page_variant') || '',
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

  function trackPixel(eventName, options){
    try {
      if (typeof window.fbq === 'function') window.fbq('track', eventName, {currency: 'KRW'}, options);
    } catch(e) {}
  }

  function trackNaverConversion(){
    try {
      if (typeof window.wcs_do !== 'function') return;
      window.wcs_do({
        wcs_id: NAVER_WCS_ID,
        conv_type: NAVER_CONV_TYPE,
        conv_value: '',
        conv_currency: 'KRW'
      });
    } catch(e) {}
  }

  function trackGtag(eventName, extra){
    try {
      if (typeof window.gtag !== 'function') return;
      var payload = {event_category: 'lead', event_label: 'spacebogam_consultation_apply'};
      Object.keys(extra || {}).forEach(function(key){ payload[key] = extra[key]; });
      window.gtag('event', eventName, payload);
    } catch(e) {}
  }

  // ---- 렌더링 -------------------------------------------------------------

  function element(tag, className, text){
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function optionsOf(question){
    var options = question.options;
    if (Array.isArray(options)) return options;
    if (typeof options === 'string') {
      try {
        var parsed = JSON.parse(options);
        return Array.isArray(parsed) ? parsed : [];
      } catch(e) { return []; }
    }
    return [];
  }

  function neutralQuestionCopy(question){
    if (typeof question !== 'string') return question;
    return question.replace('통화 가능한 시간대', '연락 가능한 시간대');
  }

  var INPUT_TYPE_BY_QUESTION_TYPE = {
    phonenumber: 'tel',
    number: 'number',
    password: 'password',
    date: 'date'
  };

  function buildField(question){
    var name = 'q' + question.id;
    var type = question.questionType;
    var choices = optionsOf(question);
    var wrap = element('div', 'cf-field');
    wrap.setAttribute('data-question-id', String(question.id));
    var label = element('label', 'cf-label');
    label.setAttribute('for', name);
    label.textContent = question.question;
    if (question.isRequired) label.appendChild(element('span', 'cf-required', ' *'));
    wrap.appendChild(label);

    if (type === 'multiple_choice' || type === 'single_choice') {
      var group = element('div', 'cf-choices');
      var inputType = type === 'multiple_choice' ? 'checkbox' : 'radio';
      choices.forEach(function(choice, index){
        var id = name + '_' + index;
        var item = element('label', 'cf-choice');
        item.setAttribute('for', id);
        var input = document.createElement('input');
        input.type = inputType;
        input.name = name;
        input.id = id;
        input.value = choice;
        item.appendChild(input);
        item.appendChild(element('span', null, choice));
        group.appendChild(item);
      });
      wrap.appendChild(group);
    } else if (type === 'select') {
      var select = document.createElement('select');
      select.name = name;
      select.id = name;
      select.className = 'cf-input';
      select.appendChild(new Option('선택해주세요', ''));
      choices.forEach(function(choice){ select.appendChild(new Option(choice, choice)); });
      wrap.appendChild(select);
    } else if (type === 'text') {
      var textarea = document.createElement('textarea');
      textarea.name = name;
      textarea.id = name;
      textarea.className = 'cf-input cf-textarea';
      textarea.rows = 3;
      wrap.appendChild(textarea);
    } else {
      var input = document.createElement('input');
      input.type = INPUT_TYPE_BY_QUESTION_TYPE[type] || 'text';
      input.name = name;
      input.id = name;
      input.className = 'cf-input';
      if (type === 'phonenumber') {
        input.inputMode = 'numeric';
        input.autocomplete = 'tel';
        input.placeholder = '010-0000-0000';
      }
      if (type === 'password') input.autocomplete = 'new-password';
      if (type === 'address') input.placeholder = '예) 부산 북구 화명동 ○○아파트';
      if (type === 'detailed_address') input.placeholder = '예) 101동 1001호';
      if (type === 'number') input.min = '0';
      wrap.appendChild(input);
    }

    if (type === 'password') {
      wrap.appendChild(element('p', 'cf-help', '신청 내용을 나중에 확인·수정할 때 쓰는 비밀번호입니다.'));
    }
    return wrap;
  }

  function readAnswer(question){
    var name = 'q' + question.id;
    var type = question.questionType;
    if (type === 'multiple_choice') {
      var checked = root.querySelectorAll('input[name="' + name + '"]:checked');
      return Array.prototype.map.call(checked, function(input){ return input.value; }).join(', ');
    }
    if (type === 'single_choice') {
      var picked = root.querySelector('input[name="' + name + '"]:checked');
      return picked ? picked.value : '';
    }
    var field = root.querySelector('[name="' + name + '"]');
    return field ? String(field.value || '').trim() : '';
  }

  // ---- 필수 항목 축소 (CMP-1369) ------------------------------------------

  /**
   * intm 질문 정의는 28문항 중 11문항을 필수로 표시한다(세부주소·비밀번호·시공장소·
   * 예산구간·인지경로·상담희망 날짜/시간 포함). 광고로 처음 들어온 사람에게 그걸 다
   * 요구해서, 최근 7일 폼을 쓰기 시작한 7명이 전원 중도 이탈했다.
   *
   * 대표 승인(2026-08-24, 확인카드 3f77c316)에 따라 **화면에서 질문을 빼지 않고**
   * 필수 표시만 4개로 좁힌다. 나머지는 '선택 입력' 접힘 영역에 그대로 남아 CRM 에
   * 똑같이 저장된다. 서버는 isRequired 를 강제하지 않으므로(intm
   * src/app/api/consultation/submit/route.ts 는 값 추출만 한다) 클라이언트만 바꾸면 된다.
   *
   * id 로 고정하지 않는 이유: 질문 정의는 intm 관리 화면에서 편집된다. 서버가 기본
   * 정보를 뽑을 때 쓰는 것과 같은 타입/문구 규칙으로 맞춰야 둘이 어긋나지 않는다.
   */
  var CORE_REQUIRED_MATCHERS = [
    function(q){ return q.questionType === 'short_answer' && /성함|이름/.test(q.question); },
    function(q){ return q.questionType === 'phonenumber' || /연락처/.test(q.question); },
    function(q){ return (q.questionType === 'address' || /주소/.test(q.question)) && !/세부/.test(q.question); },
    function(q){ return /평형|평수/.test(q.question); }
  ];

  function isCoreRequired(question){
    if (!question || typeof question.question !== 'string') return false;
    for (var i = 0; i < CORE_REQUIRED_MATCHERS.length; i++) {
      if (CORE_REQUIRED_MATCHERS[i](question)) return true;
    }
    return false;
  }

  // ---- 흐름 ---------------------------------------------------------------

  var questions = [];
  var startedTracked = false;
  var submitSucceeded = false;
  var submitting = false;
  var completedFields = {};
  var lastCompletedQuestionId = '';

  function markStarted(){
    if (startedTracked) return;
    startedTracked = true;
    sendFunnelEvent('lead_form_start');
    trackGtag('lead_form_start');
    trackPixel('InitiateCheckout');
  }

  /**
   * CMP-252: 답변 값은 절대 계측하지 않는다. 질문 id/type/순서와 완료 여부만 보내
   * 필드별 이탈 위치를 파악하면서 이름·전화·주소 같은 개인정보는 분석 도구에 남기지 않는다.
   */
  function questionTrackingDetail(question){
    return {
      question_id: String(question.id),
      question_type: question.questionType || 'unknown',
      field_position: questions.indexOf(question) + 1,
      is_required: question.isRequired ? 'true' : 'false'
    };
  }

  function fieldWrap(question){
    return root.querySelector('.cf-field[data-question-id="' + question.id + '"]');
  }

  function clearQuestionError(question){
    var wrap = fieldWrap(question);
    if (!wrap) return;
    var error = wrap.querySelector('.cf-field-error');
    if (error) error.remove();
    var fields = wrap.querySelectorAll('[name="q' + question.id + '"]');
    Array.prototype.forEach.call(fields, function(field){
      field.removeAttribute('aria-invalid');
      field.removeAttribute('aria-describedby');
    });
  }

  function renderQuestionError(question){
    var wrap = fieldWrap(question);
    if (!wrap) return null;
    clearQuestionError(question);
    var errorId = 'cf-field-error-q' + question.id;
    var error = element('p', 'cf-field-error', '필수 입력 항목입니다.');
    error.id = errorId;
    error.setAttribute('role', 'alert');
    wrap.appendChild(error);
    var fields = wrap.querySelectorAll('[name="q' + question.id + '"]');
    Array.prototype.forEach.call(fields, function(field){
      field.setAttribute('aria-invalid', 'true');
      field.setAttribute('aria-describedby', errorId);
    });
    return fields[0] || null;
  }

  function trackFieldCompletion(event){
    var target = event && event.target;
    if (!target || !target.name || target.name.charAt(0) !== 'q') return;
    var questionId = target.name.slice(1);
    var question = questions.find(function(item){ return String(item.id) === questionId; });
    if (!question || !readAnswer(question)) return;
    clearQuestionError(question);
    if (completedFields[questionId]) return;
    completedFields[questionId] = true;
    lastCompletedQuestionId = questionId;
    trackGtag('lead_form_field_complete', questionTrackingDetail(question));
  }

  function renderError(message){
    root.innerHTML = '';
    var box = element('div', 'cf-error-box');
    box.appendChild(element('p', null, message));
    var fallback = element('a', 'button', '기존 상담 신청서로 이동');
    fallback.href = 'https://intm.kr/consultation/ggbg?utm_source=spacebogam.kr&utm_medium=consultation_apply&utm_campaign=spacebogam_site&ref=spacebogam_apply_fallback';
    box.appendChild(fallback);
    root.appendChild(box);
  }

  function renderForm(){
    root.innerHTML = '';
    var form = document.createElement('form');
    form.className = 'cf-form';
    form.noValidate = true;

    var required = questions.filter(function(q){ return q.isRequired; });
    var optional = questions.filter(function(q){ return !q.isRequired; });

    var primary = element('div', 'cf-group');
    primary.appendChild(element('h2', 'cf-group-title', '상담에 꼭 필요한 정보'));
    required.forEach(function(q){ primary.appendChild(buildField(q)); });
    form.appendChild(primary);

    if (optional.length) {
      // 선택 항목까지 한 화면에 펼치면 첫인상이 설문지가 된다. 접어두되 버리지는 않는다 —
      // 상담사가 쓰는 정보라 CRM 에는 그대로 들어가야 한다.
      var details = document.createElement('details');
      details.className = 'cf-group cf-optional';
      var summary = document.createElement('summary');
      summary.textContent = '선택 입력 — 적어주시면 상담이 훨씬 구체적입니다 (' + optional.length + '개)';
      details.appendChild(summary);
      optional.forEach(function(q){ details.appendChild(buildField(q)); });
      form.appendChild(details);
    }

    var consentWrap = element('div', 'cf-consent');
    var consentLabel = element('label', 'cf-choice');
    consentLabel.setAttribute('for', 'cf-consent-input');
    var consent = document.createElement('input');
    consent.type = 'checkbox';
    consent.id = 'cf-consent-input';
    consentLabel.appendChild(consent);
    var consentText = element('span', null, '');
    consentText.innerHTML = '상담 진행을 위한 개인정보 수집·이용에 동의합니다. ' +
      '<a href="/privacy/" target="_blank" rel="noopener">개인정보처리방침</a>';
    consentLabel.appendChild(consentText);
    consentWrap.appendChild(consentLabel);
    form.appendChild(consentWrap);

    var status = element('p', 'cf-status');
    status.setAttribute('role', 'status');
    form.appendChild(status);

    var submit = element('button', 'button cf-submit', '상담 신청하기');
    submit.type = 'submit';
    form.appendChild(submit);

    form.addEventListener('input', markStarted);
    form.addEventListener('change', markStarted);
    form.addEventListener('change', trackFieldCompletion);
    // 텍스트 입력의 change 는 포커스를 떠날 때 발생한다. blur 보완으로 모바일 키보드의
    // 완료/다음 동작에서도 같은 개인정보 비수집 이벤트가 한 번만 남는다.
    form.addEventListener('blur', trackFieldCompletion, true);

    form.addEventListener('submit', function(event){
      event.preventDefault();
      // 클릭과 모바일 키보드 완료가 같은 프레임에 겹쳐도 상담 건은 한 번만 보낸다.
      if (submitting) return;
      status.textContent = '';
      status.classList.remove('cf-status-error');

      var answers = {};
      var missing = null;
      questions.forEach(clearQuestionError);
      consent.removeAttribute('aria-invalid');
      var consentError = consentWrap.querySelector('.cf-field-error');
      if (consentError) consentError.remove();
      questions.forEach(function(question){
        var value = readAnswer(question);
        if (value) answers[String(question.id)] = value;
        if (!missing && question.isRequired && !value) missing = question;
      });

      if (missing) {
        status.textContent = '「' + missing.question + '」 항목을 입력해주세요.';
        status.classList.add('cf-status-error');
        var field = renderQuestionError(missing);
        trackGtag('lead_form_validation_error', questionTrackingDetail(missing));
        if (field && field.focus) field.focus();
        return;
      }
      if (!consent.checked) {
        status.textContent = '개인정보 수집·이용 동의가 필요합니다.';
        status.classList.add('cf-status-error');
        consent.setAttribute('aria-invalid', 'true');
        var error = element('p', 'cf-field-error', '필수 동의 항목입니다.');
        error.setAttribute('role', 'alert');
        consentWrap.appendChild(error);
        trackGtag('lead_form_validation_error', {
          question_id: 'consent',
          question_type: 'consent',
          field_position: questions.length + 1,
          is_required: 'true'
        });
        consent.focus();
        return;
      }
      answers[CONSENT_ANSWER_ID] = 'true';

      submitting = true;
      submit.disabled = true;
      submit.textContent = '접수 중…';

      fetch(SUBMIT_URL, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          answers: answers,
          filePath: null,
          companyId: COMPANY_ID,
          marketingAttribution: marketingAttribution()
        })
      }).then(function(response){
        return response.json().catch(function(){ return {}; }).then(function(body){
          return {ok: response.ok, status: response.status, body: body};
        });
      }).then(function(result){
        if (!result.ok || !result.body || result.body.success !== true) {
          throw new Error((result.body && result.body.error) || ('HTTP ' + result.status));
        }
        renderSuccess(result.body);
      }).catch(function(error){
        submitting = false;
        submit.disabled = false;
        submit.textContent = '상담 신청하기';
        status.textContent = '접수에 실패했습니다. 잠시 후 다시 시도하시거나 전화로 문의해주세요. (' +
          ((error && error.message) || 'network error') + ')';
        status.classList.add('cf-status-error');
        trackGtag('lead_submit_error', {failure_reason: String((error && error.message) || '').slice(0, 100)});
      });
    });

    root.appendChild(form);
    sendFunnelEvent('lead_form_view');
    trackGtag('lead_form_view');
  }

  function renderSuccess(body){
    // 서버가 되돌려준 값을 우선 쓴다. 우리가 보낸 sbSubmitEventId 와 같은 값이어야 정상이고,
    // 다르면 서버가 자체 파생한 것이므로 그쪽이 원장의 진실이다.
    var leadEventId = body.leadEventId || submitEventId;
    submitSucceeded = true;
    trackPixel('Lead', {eventID: leadEventId});
    trackGtag('lead_submit_success', {lead_event_id: leadEventId});
    trackNaverConversion();
    sendFunnelEvent('lead_submit_success');
    // 같은 세션에서 한 건 더 신청하면 별개의 상담 건이다 — id 를 비워 다음 건이 새로 뽑게 한다.
    try { if (session) session.removeItem(EVENT_IDS_KEY); } catch(e) {}

    root.innerHTML = '';
    var box = element('div', 'cf-success');
    box.appendChild(element('h2', null, '상담 신청이 접수되었습니다.'));
    box.appendChild(element('p', null,
      '담당자가 확인 후 상담 일정을 안내해 드립니다. 접수 안내 알림톡이 곧 도착합니다.'));
    box.appendChild(element('p', 'cf-help', '추가로 확인할 내용이 있으면 담당자가 안내 과정에서 함께 여쭙습니다.'));
    var link = element('a', 'button', '공간보감 홈으로');
    link.href = '/';
    box.appendChild(link);
    root.appendChild(box);
    try { root.scrollIntoView({behavior: 'smooth', block: 'start'}); } catch(e) {}
  }

  function init(){
    // Pixel 이 아직 뜨지 않았어도 fbq 스텁이 큐에 쌓아두므로 여기서 다시 init 하지 않는다.
    if (typeof window.fbq === 'function' && !window.__spacebogamPixelInitialized) {
      window.__spacebogamPixelInitialized = META_PIXEL_ID;
    }

    fetch(QUESTIONS_URL, {method: 'GET'})
      .then(function(response){
        if (!response.ok) throw new Error('HTTP ' + response.status);
        return response.json();
      })
      .then(function(body){
        var list = (body && body.questions) || [];
        questions = list
          .filter(function(q){ return q && q.id != null && q.is_visible !== false && q.isVisible !== false; })
          .map(function(q){
            var mapped = {
              id: q.id,
              question: neutralQuestionCopy(q.question),
              questionType: q.questionType || q.question_type,
              options: q.options
            };
            // 서버가 준 is_required 는 무시하고 CMP-1369 의 핵심 4개만 필수로 둔다.
            mapped.isRequired = isCoreRequired(mapped);
            return mapped;
          });
        if (!questions.length) throw new Error('empty question set');
        renderForm();
      })
      .catch(function(error){
        trackGtag('lead_form_load_error', {failure_reason: String((error && error.message) || '').slice(0, 100)});
        renderError('상담 신청서를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.');
      });
  }

  window.addEventListener('pagehide', function(){
    if (!startedTracked || submitSucceeded) return;
    trackGtag('lead_form_abandon', {
      completed_field_count: Object.keys(completedFields).length,
      last_question_id: lastCompletedQuestionId || 'none',
      required_field_count: questions.filter(function(question){ return question.isRequired; }).length,
      transport_type: 'beacon'
    });
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
