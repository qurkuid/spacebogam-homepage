(function (root) {
  'use strict';

  var START_ENDPOINT = 'https://intm.kr/api/customer/auth/kakao/start';
  var COMPLETE_ENDPOINT = 'https://intm.kr/api/customer/auth/kakao/complete';
  var INIT_KEY = 'spacebogam.kakao.consultation.init.v1';
  var CALLBACK_KEY = 'spacebogam.kakao.consultation.callback.v1';
  var INIT_TTL_MS = 10 * 60 * 1000;
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

  var api = {
    START_ENDPOINT: START_ENDPOINT,
    COMPLETE_ENDPOINT: COMPLETE_ENDPOINT,
    INIT_TTL_MS: INIT_TTL_MS,
    isValidPhone: isValidPhone,
    isSafeAuthorizationUrl: isSafeAuthorizationUrl,
    callbackMatches: callbackMatches
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (!root || !root.document) return;

  var document = root.document;
  var panel = document.getElementById('kakao-quick-consultation');
  if (!panel || panel.hidden) return;

  var busy = false;
  var cancelPendingLogin = null;

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
    if (button.querySelector('img,svg')) return;
    if (!button.dataset.label) button.dataset.label = button.textContent;
    button.textContent = value ? busyText : button.dataset.label;
  }

  function applyConnection(result) {
    root.SB_CONSULTATION.applyKakaoProfile(result.profile || {}, text(result.consultationGrant));
    setButtonBusy(panel.querySelector('[data-kakao-start]'), false, '');
    setStatus('', '');
    busy = false;
  }

  async function startKakao() {
    if (busy) return;
    if (cancelPendingLogin) cancelPendingLogin();
    if (typeof root.BroadcastChannel !== 'function') {
      setStatus('이 브라우저에서는 이름과 연락처를 직접 입력해 주세요.', 'error');
      return;
    }
    var button = panel.querySelector('[data-kakao-start]');
    // Keep answers and uploaded files in the original window throughout OAuth.
    var loginWindow = root.open('about:blank', '_blank', 'popup,width=480,height=760');
    if (!loginWindow) {
      setStatus('카카오 로그인 창을 허용하거나 이름과 연락처를 직접 입력해 주세요.', 'error');
      return;
    }
    busy = true;
    setButtonBusy(button, true, '카카오 연결 중…');
    setStatus('', '');
    var channel;
    var timer;
    function finish() {
      if (channel) channel.close();
      root.clearTimeout(timer);
      removeStorage(INIT_KEY);
      setButtonBusy(button, false, '');
      busy = false;
      cancelPendingLogin = null;
    }
    cancelPendingLogin = finish;
    try {
      var result = await requestJson(START_ENDPOINT, { channel: 'consultation', consent: true });
      if (!isSafeAuthorizationUrl(result.authorizationUrl)
        || text(result.flow).length < 8 || text(result.codeVerifier).length < 43) {
        throw new Error('카카오 로그인 설정을 확인하지 못했습니다. 직접 입력해 주세요.');
      }
      var initiation = {
        flow: text(result.flow), codeVerifier: text(result.codeVerifier),
        expiresAt: Date.now() + INIT_TTL_MS, isTest: isTestSession(null), popup: true
      };
      if (!writeStorage(INIT_KEY, initiation)) throw new Error('브라우저 세션 저장소를 사용할 수 없습니다. 직접 입력해 주세요.');
      loginWindow.sessionStorage.setItem(INIT_KEY, JSON.stringify(initiation));
      channel = new root.BroadcastChannel('spacebogam.kakao.' + initiation.flow);
      channel.onmessage = function (event) {
        if (event.data?.success === true && text(event.data.consultationGrant)) {
          applyConnection(event.data);
        } else {
          setStatus('카카오 연결을 완료하지 못했습니다. 다시 시도하거나 직접 입력해 주세요.', 'error');
        }
        finish();
      };
      timer = root.setTimeout(function () {
        finish();
        setStatus('카카오 연결 시간이 지났습니다. 다시 시도하거나 직접 입력해 주세요.', 'error');
      }, INIT_TTL_MS);
      loginWindow.location.replace(result.authorizationUrl);
      setButtonBusy(button, false, '');
      busy = false;
    } catch (error) {
      finish();
      loginWindow.close();
      setStatus(error.message || '카카오 연결을 시작하지 못했습니다. 직접 입력해 주세요.', 'error');
    }
  }

  function returnToQuestionnaire(initiation, result) {
    if (!initiation?.popup) return false;
    try {
      var channel = new root.BroadcastChannel('spacebogam.kakao.' + initiation.flow);
      channel.postMessage(result);
      channel.close();
    } catch (_error) { return false; }
    root.close();
    return true;
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
      removeStorage(INIT_KEY);
      if (!returnToQuestionnaire(init, result)) applyConnection(result);
    } catch (error) {
      removeStorage(INIT_KEY);
      if (returnToQuestionnaire(init, { success: false })) return;
      setStatus(error.message || '카카오 계정 연결 상태를 확인하지 못했습니다. 다시 시도해 주세요.', 'error');
      setButtonBusy(button, false, '');
      busy = false;
    }
  }

  function init() {
    var startButton = panel.querySelector('[data-kakao-start]');
    if (startButton) startButton.addEventListener('click', startKakao);

    var callback = readStorage(CALLBACK_KEY);
    if (!callback) return;
    removeStorage(CALLBACK_KEY);
    var initiation = readStorage(INIT_KEY);
    if (callback.kakao === 'error') {
      if (returnToQuestionnaire(initiation, { success: false })) { removeStorage(INIT_KEY); return; }
      removeStorage(INIT_KEY);
      setStatus('카카오 로그인이 취소되었습니다. 다시 시도하거나 기존 상담 신청을 이용해 주세요.', 'error');
      return;
    }
    if (!callbackMatches(callback, initiation, Date.now())) {
      removeStorage(INIT_KEY);
      if (returnToQuestionnaire(initiation, { success: false })) return;
      setStatus('카카오 로그인 확인 시간이 지났거나 요청 정보가 일치하지 않습니다. 다시 시도해 주세요.', 'error');
      return;
    }
    completeKakao(callback, initiation);
  }

  init();
})(typeof window !== 'undefined' ? window : null);
