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
  var ATTRIBUTION_KEYS = [
    'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term',
    'gclid', 'gbraid', 'wbraid', 'fbclid', 'msclkid',
    'n_keyword', 'n_query', 'n_campaign_type', 'n_ad_group', 'n_keyword_id',
    'utm_id', 'campaign_id', 'adset_id', 'ad_id', 'asset_id'
  ];
  var STATIC_CHANNEL_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'];
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

  // CMP-1259: gtag.js 측정 ID를 하드코딩하지 않고 _ga 쿠키에서 GA4 client_id만
  // 읽는다(형식 GA1.<버전>.<clientId>, 뒤 두 세그먼트가 client_id). 값이 없으면
  // 빈 문자열 — PII 아님, 순수 GA4 익명 식별자.
  function ga4ClientId(){
    try {
      var match = document.cookie.match(/(?:^|;\s*)_ga=([^;]+)/);
      if (!match) return '';
      var parts = decodeURIComponent(match[1]).split('.');
      if (parts.length >= 4) return parts[2] + '.' + parts[3];
    } catch(error) {}
    return '';
  }

  function storedAttribution(storage){
    try {
      var stored = storage ? JSON.parse(storage.getItem(ATTRIBUTION_KEY) || 'null') : null;
      if (stored && stored.expiresAt > Date.now() && stored.values) return stored.values;
    } catch(error) {}
    return {};
  }

  function saveAttribution(storage, values){
    if (!storage) return;
    try {
      storage.setItem(ATTRIBUTION_KEY, JSON.stringify({
        values: values,
        expiresAt: Date.now() + ATTRIBUTION_TTL_MS
      }));
    } catch(error) {}
  }

  function hasAttribution(values){
    for (var i = 0; i < ATTRIBUTION_KEYS.length; i++) {
      if (values[ATTRIBUTION_KEYS[i]]) return true;
    }
    return false;
  }

  function currentAttribution(storage){
    var params = new URLSearchParams(location.search);
    var values = {};
    var stored = storedAttribution(storage);
    var selfReferral = params.get('utm_source') === SELF_REFERRAL_SOURCE;
    ATTRIBUTION_KEYS.forEach(function(key){
      var value = params.get(key) || '';
      if (value && (!selfReferral || STATIC_CHANNEL_KEYS.indexOf(key) === -1)) {
        values[key] = value;
      }
    });
    // 상담 CTA 의 하드코딩된 자기참조 채널은 실제 신규 유입이 아니다. 저장된 광고
    // first touch 를 덮거나 그 채널과 섞지 않는다. 저장값이 없는 직접 진입에서는
    // click id 같은 비채널 값만이라도 보존한다.
    if (selfReferral && hasAttribution(stored)) return stored;
    if (hasAttribution(values)) {
      saveAttribution(storage, values);
      return values;
    }
    return stored;
  }

  function boundedLandingPage(value){
    try {
      var url = new URL(value, location.href);
      url.searchParams.delete('landing_page');
      url.searchParams.delete('source_page');
      return url.toString().slice(0, JOURNEY_MAX_LENGTH);
    } catch(error) {
      return String(value || '').slice(0, JOURNEY_MAX_LENGTH);
    }
  }

  // 세션 첫 페이지에서 한 번 굳혀두고 내부 이동 뒤에도 같은 값을 쓴다. 같은 도메인의
  // 신규 폼은 이 저장값을 직접 읽으므로 URL 에 다시 중첩해 실을 필요가 없다.
  function sessionJourney(storage){
    var fallback = {
      landing_page: boundedLandingPage(location.href),
      referrer: (document.referrer || '').slice(0, JOURNEY_MAX_LENGTH)
    };
    if (!storage) return fallback;
    try {
      var stored = JSON.parse(storage.getItem(JOURNEY_KEY) || 'null');
      if (stored && stored.landing_page) return stored;
      storage.setItem(JOURNEY_KEY, JSON.stringify(fallback));
    } catch(error) {}
    return fallback;
  }

  var TEST_SESSION_KEY = 'spacebogam_funnel_is_test';
  // consultation-form.js 의 TEST_TRUTHY 와 같은 목록이어야 한다.
  // 'y' 가 빠져 있으면 ?is_test=y 세션이 상담 폼에서만 걸리고 상단 단계는 실유입으로 샌다. (CMP-225)
  var TEST_TRUTHY = ['1', 'true', 'yes', 'y', 'on'];

  function resolveTestSession(storage){
    var fromQuery = false;
    try {
      var params = new URLSearchParams(location.search);
      var raw = String(params.get('is_test') || '').trim().toLowerCase();
      fromQuery = TEST_TRUTHY.indexOf(raw) !== -1;
    } catch(error) {}
    if (!storage) return fromQuery;
    try {
      if (fromQuery) {
        storage.setItem(TEST_SESSION_KEY, 'true');
        return true;
      }
      return storage.getItem(TEST_SESSION_KEY) === 'true';
    } catch(error) {
      return fromQuery;
    }
  }

  var local = browserStorage('localStorage');
  var session = browserStorage('sessionStorage');
  var clientId = storedId(local, CLIENT_KEY);
  var sessionId = storedId(session, SESSION_KEY);
  var attribution = currentAttribution(local);
  var journey = sessionJourney(session);
  // CMP-191: 검증 세션 표식. 유입 URL 의 is_test 를 세션 내내 끌고 간다.
  // 표식이 없으면 QA 가 실유입과 구분되지 않고 퍼널 상단 단계를 부풀린다.
  var testSession = resolveTestSession(session);
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
    heroHeadline.innerHTML = '부산 아파트 인테리어,<br>비용·기간·사례<br>먼저 확인하세요';
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
      deviceType: deviceType(),
      // CMP-225: 이 표식이 없으면 검증 세션의 page_view·scroll_50·*_click 이
      // 실유입으로 집계돼 퍼널 visits 를 부풀린다. 수신 스키마는 boolean 을 받는다.
      isTest: testSession
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

  // CMP-173: 신규 폼 /consultation/apply/ 도 상담 링크로 센다. 빠지면 그 클릭이
  // consultation_click 으로 수집되지 않아 퍼널에서 상담 단계가 통째로 비어 보인다.
  var CONSULTATION_PATHS = ['/consultation/', '/consultation', '/consultation/apply/', '/consultation/apply'];

  function isConsultationUrl(url){
    return (
      (url.hostname === 'intm.kr' && url.pathname === '/consultation/ggbg') ||
      ((url.hostname === location.hostname || !url.hostname) &&
        CONSULTATION_PATHS.indexOf(url.pathname) !== -1)
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
      var sameOrigin = url.hostname === location.hostname || !url.hostname;
      var overrideSelfReferral = hasAttribution(attribution) && hasSelfReferralUtm(url);
      if (overrideSelfReferral) {
        STATIC_CHANNEL_KEYS.forEach(function(key){ url.searchParams.delete(key); });
      }
      ATTRIBUTION_KEYS.forEach(function(key){
        if (!attribution[key]) return;
        if (!url.searchParams.has(key) || overrideSelfReferral) {
          url.searchParams.set(key, attribution[key]);
        }
      });
      url.searchParams.set('sbClientId', clientId);
      url.searchParams.set('sbSessionId', sessionId);
      // 같은 도메인은 session journey 를 직접 읽는다. 레거시 intm 링크만 도메인
      // 경계를 넘는 landing/referrer 가 필요하며 source_page 는 항상 bounded path 다.
      url.searchParams.delete('landing_page');
      url.searchParams.delete('source_page');
      if (sameOrigin) {
        url.searchParams.delete('referrer');
      } else {
        setIfPresent(url, 'landing_page', journey.landing_page);
        setIfPresent(url, 'referrer', journey.referrer);
      }
      setIfPresent(url, 'source_page', location.pathname);
      url.searchParams.set('experiment_id', EXPERIMENT_ID);
      url.searchParams.set('experiment_variant', experimentVariant);
      // CMP-191: 같은 도메인은 is_test, 레거시 intm 링크는 n 으로 검증 표식을 넘긴다.
      if (testSession) url.searchParams.set(sameOrigin ? 'is_test' : 'n', '1');
      else url.searchParams.delete(sameOrigin ? 'is_test' : 'n');
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

    // CMP-1259 v2 (대표 실측 확인 후 범위 축소, CMP-1256 코멘트 참고): GA4/Clarity가
    // 이미 라이브에서 체류를 잡고 있어 INTM 신규 전송은 폐기했다. 여기서 남은 건
    // Meta 입찰 신호용 픽셀 이벤트 하나뿐이다 — Meta 최적화는 자기 픽셀이 받은
    // 이벤트만 학습하므로 GA4/Clarity 데이터는 대체가 안 된다.
    // document.visibilityState==='visible' 구간만 250ms 틱으로 누적, 30000ms 도달시
    // 세션당 1회(sessionStorage). PII 없이 utm/fbclid 유무/GA4 client_id만 전송한다.
    var QUALIFIED_VISIBLE_MS = 30000;
    var QUALIFIED_TICK_MS = 250;
    var QUALIFIED_SESSION_KEY = 'spacebogam_funnel_qualified30_sent';
    if (!testSession && session && session.getItem(QUALIFIED_SESSION_KEY) !== 'true') {
      var visibleAccumMs = 0;
      var qualifiedTimer = window.setInterval(function(){
        if (document.visibilityState !== 'visible') return;
        visibleAccumMs += QUALIFIED_TICK_MS;
        if (visibleAccumMs < QUALIFIED_VISIBLE_MS) return;
        window.clearInterval(qualifiedTimer);
        try { session.setItem(QUALIFIED_SESSION_KEY, 'true'); } catch(error) {}
        if (typeof window.fbq === 'function') {
          window.fbq('trackCustom', 'QualifiedLanding30s', {
            page_path: location.pathname,
            utm_source: attribution.utm_source || '',
            utm_medium: attribution.utm_medium || '',
            utm_campaign: attribution.utm_campaign || '',
            hasFbclid: !!attribution.fbclid,
            ga4ClientId: ga4ClientId()
          });
        }
      }, QUALIFIED_TICK_MS);
    }

    // CMP-1186: 25/50/75/100% 4구간을 잰다. eventName 은 intm DB CHECK 제약에 이미
    // 있는 'scroll_50' 을 그대로 재사용하고 scrollDepth 값으로만 구간을 구분한다.
    // 새 eventName(scroll_25 등)을 쓰려면 intm 쪽 스키마·DB 마이그레이션이 별도로
    // 필요해 배포 리스크가 커진다 — 필요해지면 후속 이슈로 분리.
    var SCROLL_THRESHOLDS = [25, 50, 75, 100];
    var scrollSentUpTo = 0;
    window.addEventListener('scroll', function(){
      if (scrollSentUpTo >= SCROLL_THRESHOLDS.length) return;
      var scrollable = document.documentElement.scrollHeight - window.innerHeight;
      if (scrollable <= 0) return;
      var pct = window.scrollY / scrollable * 100;
      while (scrollSentUpTo < SCROLL_THRESHOLDS.length) {
        var depth = SCROLL_THRESHOLDS[scrollSentUpTo];
        // 100% 는 서브픽셀 반올림 오차로 정확히 안 맞을 수 있어 살짝 여유를 둔다.
        if (pct < (depth >= 100 ? 99 : depth)) break;
        send('scroll_50', {scrollDepth: depth});
        scrollSentUpTo++;
      }
    }, {passive: true});
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
