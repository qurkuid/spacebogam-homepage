(function(){
  var ENDPOINT = 'https://intm.kr/api/marketing/funnel-events';
  var CLIENT_KEY = 'spacebogam_funnel_client_id';
  var SESSION_KEY = 'spacebogam_funnel_session_id';
  var ATTRIBUTION_KEY = 'spacebogam_funnel_attribution';
  var JOURNEY_KEY = 'spacebogam_funnel_journey';
  var JOURNEY_MAX_LENGTH = 1000;
  var EXPERIMENT_ID = 'homepage_headline_v1';
  var EXPERIMENT_KEY = 'spacebogam_homepage_headline_v1_variant';
  var FORCE_VARIANT_KEY = 'spacebogam_headline_v1_force_variant';
  var ATTRIBUTION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
  var UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'];
  var SELF_REFERRAL_SOURCE = 'spacebogam.kr';
  var RETRY_DELAY_MS = 1500;
  // 콘솔/QA 에서 읽을 수 있는 전송 실패 버퍼 (window.__spacebogamFunnelFailures)
  var FAILURES = window.__spacebogamFunnelFailures || (window.__spacebogamFunnelFailures = []);

  function uuid(){
    if (window.crypto && typeof window.crypto.randomUUID === 'function') {
      return window.crypto.randomUUID();
    }
    if (window.crypto && typeof window.crypto.getRandomValues === 'function') {
      var bytes = new Uint8Array(16);
      window.crypto.getRandomValues(bytes);
      bytes[6] = (bytes[6] & 15) | 64;
      bytes[8] = (bytes[8] & 63) | 128;
      var hex = Array.prototype.map.call(bytes, function(byte){
        return byte.toString(16).padStart(2, '0');
      });
      return hex.slice(0, 4).join('') + '-' +
        hex.slice(4, 6).join('') + '-' +
        hex.slice(6, 8).join('') + '-' +
        hex.slice(8, 10).join('') + '-' +
        hex.slice(10, 16).join('');
    }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(character){
      var random = Math.random() * 16 | 0;
      var value = character === 'x' ? random : (random & 3 | 8);
      return value.toString(16);
    });
  }

  function browserStorage(name){
    try {
      return window[name];
    } catch(error) {
      return null;
    }
  }

  function storedId(storage, key){
    if (!storage) return uuid();
    try {
      var value = storage.getItem(key);
      if (value) return value;
      value = uuid();
      storage.setItem(key, value);
      return value;
    } catch(error) {
      return uuid();
    }
  }

  function currentAttribution(storage){
    var params = new URLSearchParams(location.search);
    var values = {};
    var hasCampaignValue = false;
    UTM_KEYS.forEach(function(key){
      var value = params.get(key) || '';
      values[key] = value;
      if (value) hasCampaignValue = true;
    });
    if (hasCampaignValue) {
      if (storage) {
        try {
          storage.setItem(ATTRIBUTION_KEY, JSON.stringify({
            values: values,
            expiresAt: Date.now() + ATTRIBUTION_TTL_MS
          }));
        } catch(error) {}
      }
      return values;
    }
    try {
      var stored = storage ? JSON.parse(storage.getItem(ATTRIBUTION_KEY) || 'null') : null;
      if (stored && stored.expiresAt > Date.now() && stored.values) return stored.values;
    } catch(error) {}
    return values;
  }

  // CMP-171: landing_page / referrer 는 상담 링크에 실려야만 consult_req 에 남는다.
  // 세션 첫 페이지에서 한 번 굳혀두고 내부 이동 뒤에도 같은 값을 쓴다.
  function sessionJourney(storage){
    var fallback = { landing_page: location.href, referrer: document.referrer || '' };
    if (!storage) return fallback;
    try {
      var stored = JSON.parse(storage.getItem(JOURNEY_KEY) || 'null');
      if (stored && stored.landing_page) return stored;
      storage.setItem(JOURNEY_KEY, JSON.stringify(fallback));
    } catch(error) {}
    return fallback;
  }

  var local = browserStorage('localStorage');
  var session = browserStorage('sessionStorage');
  var clientId = storedId(local, CLIENT_KEY);
  var sessionId = storedId(session, SESSION_KEY);
  var attribution = currentAttribution(local);
  var journey = sessionJourney(session);
  var isHomepage = location.pathname === '/' || location.pathname === '/index.html';
  var variantFromQuery = null;
  var forceVariant = null;

  function readForcedVariant(){
    if (forceVariant !== null) return forceVariant;
    forceVariant = '';
    try {
      var params = new URLSearchParams(location.search);
      forceVariant = normalizeExperimentVariant(
        params.get('experiment_force') ||
        params.get('force_experiment') ||
        params.get('experiment_variant_force')
      );
      if (!forceVariant && local) {
        forceVariant = normalizeExperimentVariant(local.getItem(FORCE_VARIANT_KEY));
      }
      if (forceVariant && local) {
        local.setItem(FORCE_VARIANT_KEY, forceVariant);
      }
    } catch(error) {}
    return forceVariant;
  }

  function normalizeExperimentVariant(value){
    if (!value) return '';
    var valueLower = String(value).toLowerCase();
    if (valueLower === 'a' || valueLower === 'home_a' || valueLower === 'home_a_default' || valueLower === 'home_a_current') return 'A';
    if (valueLower === 'b' || valueLower === 'home_b' || valueLower === 'home_b_visit_stage_standard' || valueLower === 'home_b_current') return 'B';
    return '';
  }

  function readStoredExperimentVariant(){
    try {
      if (!session) return '';
      return normalizeExperimentVariant(session.getItem(EXPERIMENT_KEY));
    } catch(error) {
      return '';
    }
  }

  function writeStoredExperimentVariant(value){
    if (!session) return;
    try {
      session.setItem(EXPERIMENT_KEY, value);
    } catch(error) {}
  }

  function resolveExperimentVariant(){
    var globalVariant = normalizeExperimentVariant(window.__spacebogamHomepageHeadlineVariant);
    if (globalVariant) {
      writeStoredExperimentVariant(globalVariant);
      return globalVariant;
    }
    var forcedVariant = readForcedVariant();
    if (forcedVariant) {
      writeStoredExperimentVariant(forcedVariant);
      return forcedVariant;
    }
    if (variantFromQuery === null) {
      try {
        var params = new URLSearchParams(location.search);
        variantFromQuery = normalizeExperimentVariant(params.get('experiment_variant'));
        if (!variantFromQuery) variantFromQuery = normalizeExperimentVariant(params.get('variant'));
        if (!variantFromQuery) variantFromQuery = normalizeExperimentVariant(params.get('page_variant'));
      } catch(error) {
        variantFromQuery = '';
      }
    }
    if (variantFromQuery) {
      writeStoredExperimentVariant(variantFromQuery);
      return variantFromQuery;
    }

    if (location.pathname.indexOf('/ab/home-b/') === 0) {
      writeStoredExperimentVariant('B');
      return 'B';
    }

    if (isHomepage) {
      var stored = readStoredExperimentVariant();
      if (stored) return stored;
      var randomValue = Math.random();
      if (window.crypto && typeof window.crypto.getRandomValues === 'function') {
        var randomBytes = new Uint32Array(1);
        window.crypto.getRandomValues(randomBytes);
        randomValue = randomBytes[0] / 4294967296;
      }
      var assigned = randomValue < 0.5 ? 'A' : 'B';
      writeStoredExperimentVariant(assigned);
      return assigned;
    }

    return readStoredExperimentVariant() || 'A';
  }

  var experimentVariant = resolveExperimentVariant();

  function pageVariant(){
    if (experimentVariant === 'B') return 'home_b_visit_stage_standard';
    return 'home_a_default';
  }

  function applyHomeHeadline(){
    if (!isHomepage) return;
    if (experimentVariant !== 'B') return;
    var heroHeadline = document.querySelector('main .hero h1');
    if (!heroHeadline) return;
    heroHeadline.innerHTML = '부산 프리미엄 아파트,<br>우리 집에 맞는<br>완성도부터 잡습니다';
  }

  function deviceType(){
    if (window.innerWidth < 768) return 'mobile';
    if (window.innerWidth < 1024) return 'tablet';
    return 'desktop';
  }

  function send(eventName, detail){
    var payload = {
      eventId: uuid(),
      clientId: clientId,
      sessionId: sessionId,
      eventName: eventName,
      pagePath: location.pathname,
      pageTitle: document.title,
      occurredAt: new Date().toISOString(),
      utmSource: attribution.utm_source || '',
      utmMedium: attribution.utm_medium || '',
      utmCampaign: attribution.utm_campaign || '',
      utmContent: attribution.utm_content || '',
      utmTerm: attribution.utm_term || '',
      // 수신 스키마(intm funnelEventInputSchema)는 .strict() 다.
      // camelCase 키만 허용하므로 snake_case 별칭을 추가하면 전량 400 이 된다. (CMP-141)
      experimentId: EXPERIMENT_ID,
      experimentVariant: experimentVariant,
      ctaLocation: detail && detail.ctaLocation || '',
      ctaText: detail && detail.ctaText || '',
      pageVariant: pageVariant(),
      deviceType: deviceType()
    };
    if (detail && typeof detail.scrollDepth === 'number') payload.scrollDepth = detail.scrollDepth;
    if (detail && typeof detail.engagedSeconds === 'number') payload.engagedSeconds = detail.engagedSeconds;
    post(payload, 0);
  }

  // 전송 실패를 조용히 삼키지 않는다. 재시도 1회 + 관측 가능한 신호를 남긴다. (CMP-141)
  function reportFailure(payload, reason){
    var record = {
      eventName: payload.eventName,
      sessionId: payload.sessionId,
      reason: String(reason).slice(0, 200),
      at: new Date().toISOString()
    };
    FAILURES.push(record);
    if (FAILURES.length > 20) FAILURES.shift();
    try {
      if (window.console && typeof window.console.warn === 'function') {
        window.console.warn('[spacebogam-funnel] ingest 실패', record);
      }
    } catch(error) {}
    try {
      if (typeof window.gtag === 'function') {
        window.gtag('event', 'funnel_ingest_error', {
          failed_event_name: record.eventName,
          failure_reason: record.reason
        });
      }
    } catch(error) {}
  }

  function post(payload, attempt){
    fetch(ENDPOINT, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(payload),
      keepalive: true
    }).then(function(response){
      if (response.ok) return;
      // 4xx 는 계약 불일치라 재시도해도 낫지 않는다. 즉시 신호만 남긴다.
      // 429/5xx 는 일시적이므로 1회 재시도한다. eventId 가 동일해 원장에서 dedup 된다.
      if ((response.status === 429 || response.status >= 500) && attempt < 1) {
        window.setTimeout(function(){ post(payload, attempt + 1); }, RETRY_DELAY_MS);
        return;
      }
      reportFailure(payload, 'HTTP ' + response.status);
    }).catch(function(error){
      if (attempt < 1) {
        window.setTimeout(function(){ post(payload, attempt + 1); }, RETRY_DELAY_MS);
        return;
      }
      reportFailure(payload, (error && error.message) || 'network error');
    });
  }

  function isConsultationUrl(url){
    return (
      (url.hostname === 'intm.kr' && url.pathname === '/consultation/ggbg') ||
      ((url.hostname === location.hostname || !url.hostname) &&
        (url.pathname === '/consultation/' || url.pathname === '/consultation'))
    );
  }

  // 상담 링크에 하드코딩된 자기참조 UTM(utm_source=spacebogam.kr)은 광고 소스가 아니라
  // 자리표시자다. 저장된 유입 attribution 이 있으면 그쪽이 우선한다.
  function hasSelfReferralUtm(url){
    var source = url.searchParams.get('utm_source') || '';
    return source === SELF_REFERRAL_SOURCE;
  }

  function setIfPresent(url, key, value){
    var text = (value || '').slice(0, JOURNEY_MAX_LENGTH);
    if (text) url.searchParams.set(key, text);
  }

  function decorateConsultationLink(anchor){
    try {
      var url = new URL(anchor.getAttribute('href') || '', location.href);
      if (!isConsultationUrl(url)) return;
      var overrideSelfReferral = attribution.utm_source && hasSelfReferralUtm(url);
      UTM_KEYS.forEach(function(key){
        if (!attribution[key]) return;
        if (!url.searchParams.has(key) || overrideSelfReferral) {
          url.searchParams.set(key, attribution[key]);
        }
      });
      url.searchParams.set('sbClientId', clientId);
      url.searchParams.set('sbSessionId', sessionId);
      // 유입 랜딩·외부 리퍼러·상담 링크를 누른 페이지. 상담 저장 시 그대로 귀속에 들어간다.
      // 빈 값은 붙이지 않는다. 링크 길이를 늘리기만 하고 원천에는 ''로 남는다.
      setIfPresent(url, 'landing_page', journey.landing_page);
      setIfPresent(url, 'referrer', journey.referrer);
      setIfPresent(url, 'source_page', location.href);
      url.searchParams.set('experiment_id', EXPERIMENT_ID);
      url.searchParams.set('experiment_variant', experimentVariant);
      anchor.setAttribute('href', url.toString());
    } catch(error) {}
  }

  function clickDetail(anchor){
    return {
      ctaLocation: anchor.dataset.ctaLocation || anchor.className || 'link',
      ctaText: (anchor.textContent || '').trim().slice(0, 300)
    };
  }

  function handleClick(event){
    var target = event.target;
    if (!(target instanceof Element)) return;
    var anchor = target.closest('a[href]');
    if (!anchor) return;
    var href = anchor.getAttribute('href') || '';
    var url;
    try {
      url = new URL(href, location.href);
    } catch(error) {
      return;
    }

    if (isConsultationUrl(url)) {
      decorateConsultationLink(anchor);
      send('consultation_click', clickDetail(anchor));
      return;
    }
    if (url.protocol === 'tel:') {
      send('phone_click', clickDetail(anchor));
      return;
    }
    if (url.hostname === 'pf.kakao.com') {
      send('kakao_click', clickDetail(anchor));
      return;
    }
    if (/portfolio|case/.test(url.pathname)) {
      send('portfolio_click', clickDetail(anchor));
    }
  }

  function init(){
    document.querySelectorAll('a[href]').forEach(decorateConsultationLink);
    document.addEventListener('click', handleClick, true);
    send('page_view');
    applyHomeHeadline();

    window.setTimeout(function(){
      if (document.visibilityState === 'visible') {
        send('engaged_session', {engagedSeconds: 10});
      }
    }, 10000);

    var scrollSent = false;
    window.addEventListener('scroll', function(){
      if (scrollSent) return;
      var scrollable = document.documentElement.scrollHeight - window.innerHeight;
      if (scrollable <= 0 || window.scrollY / scrollable < 0.5) return;
      scrollSent = true;
      send('scroll_50', {scrollDepth: 50});
    }, {passive: true});
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
