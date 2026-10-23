(function (root) {
  'use strict';

  var START_ENDPOINT = 'https://intm.kr/api/customer/auth/kakao/start';
  var COMPLETE_ENDPOINT = 'https://intm.kr/api/customer/auth/kakao/complete';
  var SUBMIT_ENDPOINT = 'https://intm.kr/api/consultation/submit';
  var COMPANY_ID = '4206bdfd-b51d-4433-9f8e-c854131948cc';
  var INIT_KEY = 'spacebogam.kakao.consultation.init.v1';
  var CALLBACK_KEY = 'spacebogam.kakao.consultation.callback.v1';
  var INIT_TTL_MS = 10 * 60 * 1000;
  var ATTRIBUTION_KEYS = [
    'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term',
    'gclid', 'gbraid', 'wbraid', 'fbclid', 'msclkid', 'n_keyword', 'n_query',
    'n_campaign_type', 'n_ad_group', 'n_keyword_id', 'utm_id', 'campaign_id',
    'adset_id', 'ad_id', 'asset_id'
  ];

  function text(value) {
    return typeof value === 'string' ? value.trim() : '';
  }

  function isValidPhone(value) {
    return /^01\d-?\d{3,4}-?\d{4}$/.test(text(value));
  }

  function isSafeAuthorizationUrl(value) {
    try {
      var url = new URL(value);
      if (url.protocol !== 'https:' || url.username || url.password || url.port) return false;
      return (url.hostname === 'intm.kr' && url.pathname === '/api/customer/auth/kakao/authorize')
        || (url.hostname === 'kauth.kakao.com' && url.pathname === '/oauth/authorize');
    } catch (_error) {
      return false;
    }
  }

  function isValidInitiation(init, now) {
    return !!init
      && text(init.flow).length >= 8
      && text(init.codeVerifier).length >= 43
      && Number.isFinite(init.expiresAt)
      && init.expiresAt > now;
  }

  function callbackMatches(callback, init, now) {
    return !!callback
      && callback.kakao === 'success'
      && isValidInitiation(init, now)
      && text(callback.flow) === text(init.flow);
  }

  function buildSubmission(input) {
    var intake = input.intake || {};
    return {
      type: 'intake',
      intake: {
        name: text(intake.name),
        phone: text(intake.phone),
        address: text(intake.address),
        spaceType: intake.spaceType,
        consent: true
      },
      companyId: COMPANY_ID,
      kakaoGrant: input.kakaoGrant,
      marketingAttribution: Object.assign({}, input.marketingAttribution, {
        sbSubmitEventId: input.eventId,
        is_test: input.isTest ? 'true' : ''
      })
    };
  }

  var api = {
    START_ENDPOINT: START_ENDPOINT,
    COMPLETE_ENDPOINT: COMPLETE_ENDPOINT,
    SUBMIT_ENDPOINT: SUBMIT_ENDPOINT,
    COMPANY_ID: COMPANY_ID,
    INIT_TTL_MS: INIT_TTL_MS,
    isValidPhone: isValidPhone,
    isSafeAuthorizationUrl: isSafeAuthorizationUrl,
    callbackMatches: callbackMatches,
    buildSubmission: buildSubmission
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (!root || !root.document) return;

  var document = root.document;
  var panel = document.getElementById('kakao-quick-consultation');
  if (!panel || panel.hidden) return;

  var grant = '';
  var profile = null;
  var pendingSubmission = null;
  var busy = false;
  var qaSession = false;

  function readStorage(key) {
    try {
      return JSON.parse(root.sessionStorage.getItem(key) || 'null');
    } catch (_error) {
      return null;
    }
  }

  function writeStorage(key, value) {
    try {
      root.sessionStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (_error) {
      return false;
    }
  }

  function removeStorage(key) {
    try { root.sessionStorage.removeItem(key); } catch (_error) {}
  }

  function isTestSession(init) {
    var queryValue = new URLSearchParams(root.location.search).get('is_test') || '';
    var stored = '';
    try { stored = root.sessionStorage.getItem('spacebogam_funnel_is_test') || ''; } catch (_error) {}
    return /^(1|true|yes|y|on)$/i.test(queryValue) || stored === 'true' || init?.isTest === true;
  }

  function trackingValue(key) {
    var direct = new URLSearchParams(root.location.search).get(key);
    if (direct && !(key === 'utm_source' && direct === 'spacebogam.kr')) return direct;
    for (var i = 0; i < 2; i += 1) {
      var storageKey = i === 0 ? 'spacebogam_funnel_first_touch_attribution' : 'spacebogam_funnel_attribution';
      try {
        var saved = JSON.parse(root.localStorage.getItem(storageKey) || 'null');
        if (saved && saved.expiresAt > Date.now() && saved.values && saved.values[key]) return saved.values[key];
      } catch (_error) {}
    }
    return '';
  }

  function marketingAttribution() {
    var data = {
      form_path: root.location.pathname,
      source_page: root.location.pathname,
      submitted_at: new Date().toISOString(),
      device_type: root.innerWidth < 768 ? 'mobile' : root.innerWidth < 1024 ? 'tablet' : 'desktop'
    };
    ATTRIBUTION_KEYS.forEach(function (key) {
      var value = trackingValue(key);
      if (value) data[key] = value;
    });
    return data;
  }

  async function requestJson(url, body) {
    var response = await root.fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
      credentials: 'omit'
    });
    var result = null;
    try { result = await response.json(); } catch (_error) {}
    if (!response.ok) {
      var message = text(result && (result.message || result.error));
      throw new Error(message || '요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.');
    }
    return result || {};
  }

  function setStatus(message, kind) {
    var status = panel.querySelector('[data-kakao-status]');
    if (!status) return;
    status.textContent = message || '';
    status.dataset.kind = kind || '';
  }

  function setButtonBusy(button, value, busyText) {
    if (!button) return;
    button.disabled = value;
    button.setAttribute('aria-busy', String(value));
    if (button.querySelector('img')) return;
    if (!button.dataset.label) button.dataset.label = button.textContent;
    button.textContent = value ? busyText : button.dataset.label;
  }

  function showConnectedForm() {
    var name = text(profile && profile.name);
    panel.classList.remove('kakao-quick--entry');
    panel.innerHTML = [
      '<div class="kakao-quick__heading">',
      '<p class="kakao-quick__eyebrow">KAKAO QUICK CONSULTATION</p>',
      '<h2>상담 내용을 확인해 주세요</h2>',
      '<p>카카오 계정이 연결되었습니다. 연락처와 현장 정보를 직접 입력한 뒤 신청해 주세요.</p>',
      '</div>',
      '<form class="kakao-quick__form" data-kakao-form novalidate>',
      '<label><span>이름</span><input name="name" autocomplete="name" maxlength="100" required></label>',
      '<label><span>연락받을 휴대전화</span><input name="phone" type="tel" inputmode="tel" autocomplete="tel" maxlength="20" placeholder="010-1234-5678" required></label>',
      '<label><span>현장 주소</span><input name="address" autocomplete="street-address" maxlength="500" placeholder="시·구·동 또는 도로명 주소" required></label>',
      '<label><span>공간 유형</span><select name="spaceType" required><option value="">선택해 주세요</option><option value="apartment">아파트</option><option value="house">주택·빌라</option><option value="commercial">상업 공간</option></select></label>',
      '<p class="kakao-quick__notice">입력한 휴대전화는 카카오에서 인증된 번호가 아닙니다. 접수 후 담당자가 전화로 내용을 확인하며, 이 신청만으로 방문 일정이 확정되지는 않습니다.</p>',
      '<p class="kakao-quick__status" data-kakao-status aria-live="polite"></p>',
      '<div class="kakao-quick__actions"><button class="kakao-quick__submit" type="submit">상담 신청 접수</button><a href="#stage" data-detailed-form>기존 자세한 상담 신청</a></div>',
      '</form>'
    ].join('');
    var form = panel.querySelector('[data-kakao-form]');
    form.elements.name.value = name;
    form.addEventListener('submit', submitConsultation);
    bindDetailedLinks();
    form.elements.phone.focus();
  }

  function validateForm(form) {
    var intake = {
      name: text(form.elements.name.value),
      phone: text(form.elements.phone.value),
      address: text(form.elements.address.value),
      spaceType: form.elements.spaceType.value
    };
    if (!intake.name) return { error: '이름을 입력해 주세요.' };
    if (!isValidPhone(intake.phone)) return { error: '휴대전화 번호를 010-1234-5678 형식으로 입력해 주세요.' };
    if (!intake.address) return { error: '현장 주소를 입력해 주세요.' };
    if (['apartment', 'house', 'commercial'].indexOf(intake.spaceType) === -1) return { error: '공간 유형을 선택해 주세요.' };
    return { intake: intake };
  }

  async function submitConsultation(event) {
    event.preventDefault();
    if (busy || !grant) return;
    var form = event.currentTarget;
    var checked = validateForm(form);
    if (checked.error) {
      setStatus(checked.error, 'error');
      return;
    }
    if (!pendingSubmission) {
      var init = readStorage(INIT_KEY);
      pendingSubmission = buildSubmission({
        intake: checked.intake,
        kakaoGrant: grant,
        marketingAttribution: marketingAttribution(),
        eventId: root.crypto.randomUUID(),
        isTest: qaSession
      });
    }
    busy = true;
    var button = form.querySelector('button[type="submit"]');
    setButtonBusy(button, true, '접수 중…');
    setStatus('상담 신청을 접수하고 있습니다.', '');
    try {
      await requestJson(SUBMIT_ENDPOINT, pendingSubmission);
      pendingSubmission = null;
      grant = '';
      panel.innerHTML = [
        '<div class="kakao-quick__success" role="status">',
        '<p class="kakao-quick__eyebrow">APPLICATION RECEIVED</p>',
        '<h2>상담 신청이 접수되었습니다</h2>',
        '<p>담당자가 입력하신 휴대전화로 연락해 상담 내용과 방문 가능 일정을 확인합니다. 전화 확인 전에는 방문 예약이 확정되지 않습니다.</p>',
        '<a href="#stage" data-detailed-form>기존 자세한 상담 신청 보기</a>',
        '</div>'
      ].join('');
      bindDetailedLinks();
    } catch (error) {
      setStatus(error.message || '접수 상태를 확인하지 못했습니다. 같은 내용으로 다시 시도해 주세요.', 'error');
      setButtonBusy(button, false, '');
    } finally {
      busy = false;
    }
  }

  function bindDetailedLinks() {
    panel.querySelectorAll('[data-detailed-form]').forEach(function (link) {
      link.addEventListener('click', function () {
        var stage = document.getElementById('stage');
        if (stage) stage.setAttribute('tabindex', '-1');
        root.setTimeout(function () { if (stage) stage.focus({ preventScroll: true }); }, 0);
      });
    });
  }

  async function startKakao() {
    if (busy) return;
    var button = panel.querySelector('[data-kakao-start]');
    busy = true;
    setButtonBusy(button, true, '카카오 연결 중…');
    setStatus('', '');
    try {
      var result = await requestJson(START_ENDPOINT, { channel: 'consultation', consent: true });
      if (!isSafeAuthorizationUrl(result.authorizationUrl)
        || text(result.flow).length < 8
        || text(result.codeVerifier).length < 43) {
        throw new Error('카카오 로그인 설정을 확인하지 못했습니다. 기존 상담 신청을 이용해 주세요.');
      }
      var init = {
        flow: text(result.flow),
        codeVerifier: text(result.codeVerifier),
        expiresAt: Date.now() + INIT_TTL_MS,
        isTest: isTestSession(null)
      };
      if (!writeStorage(INIT_KEY, init)) throw new Error('브라우저의 세션 저장소를 사용할 수 없습니다. 기존 상담 신청을 이용해 주세요.');
      root.location.assign(result.authorizationUrl);
    } catch (error) {
      setStatus(error.message || '카카오 로그인을 시작하지 못했습니다. 기존 상담 신청을 이용해 주세요.', 'error');
      setButtonBusy(button, false, '');
      busy = false;
    }
  }

  async function completeKakao(callback, init) {
    busy = true;
    var button = panel.querySelector('[data-kakao-start]');
    setButtonBusy(button, true, '카카오 계정 확인 중…');
    setStatus('카카오 계정을 확인하고 있습니다.', '');
    try {
      var result = await requestJson(COMPLETE_ENDPOINT, {
        flow: init.flow,
        codeVerifier: init.codeVerifier
      });
      if (result.success !== true || !text(result.consultationGrant)) {
        throw new Error('카카오 계정 연결을 완료하지 못했습니다. 다시 로그인해 주세요.');
      }
      grant = text(result.consultationGrant);
      profile = result.profile && typeof result.profile === 'object' ? result.profile : {};
      qaSession = isTestSession(init);
      removeStorage(INIT_KEY);
      busy = false;
      showConnectedForm();
    } catch (error) {
      setStatus(error.message || '카카오 계정 연결 상태를 확인하지 못했습니다. 다시 시도해 주세요.', 'error');
      setButtonBusy(button, false, '');
      busy = false;
    }
  }

  function init() {
    var startButton = panel.querySelector('[data-kakao-start]');
    if (startButton) startButton.addEventListener('click', startKakao);
    bindDetailedLinks();

    var callback = readStorage(CALLBACK_KEY);
    if (!callback) return;
    removeStorage(CALLBACK_KEY);
    var initiation = readStorage(INIT_KEY);
    if (callback.kakao === 'error') {
      removeStorage(INIT_KEY);
      setStatus('카카오 로그인이 취소되었습니다. 다시 시도하거나 기존 상담 신청을 이용해 주세요.', 'error');
      return;
    }
    if (!callbackMatches(callback, initiation, Date.now())) {
      removeStorage(INIT_KEY);
      setStatus('카카오 로그인 확인 시간이 지났거나 요청 정보가 일치하지 않습니다. 다시 시도해 주세요.', 'error');
      return;
    }
    completeKakao(callback, initiation);
  }

  init();
})(typeof window !== 'undefined' ? window : null);
