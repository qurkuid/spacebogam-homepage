(function(){
  var SOURCE = 'spacebogam.kr';
  var MEDIUM = 'homepage';
  var CAMPAIGN = 'spacebogam_site';
  var NAVER_CTS_ACCOUNT_ID = 's_7702568df18';
  var NAVER_ANALYTICS_ACCOUNT_ID = '183d82ef1dd8190';
  var NAVER_CTS_DOMAIN = 'spacebogam.kr';
  var NAVER_WCS_SCRIPT_SRC = 'https://wcs.naver.net/wcslog.js';
  var META_PIXEL_ID = '512750840350337';
  var META_PIXEL_SCRIPT_SRC = 'https://connect.facebook.net/en_US/fbevents.js';
  var KAKAO_CHAT_URL = 'http://pf.kakao.com/_UEUBn/chat';
  var EXPERIMENT_ID = 'homepage_headline_v1';
  var EXPERIMENT_KEY = 'spacebogam_homepage_headline_v1_variant';
  var FORCE_VARIANT_KEY = 'spacebogam_headline_v1_force_variant';
  var ATTRIBUTION_KEY = 'spacebogam_funnel_attribution';
  var JOURNEY_KEY = 'spacebogam_funnel_journey';
  var ATTRIBUTION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
  var JOURNEY_MAX_LENGTH = 1000;
  var SELF_REFERRAL_SOURCE = 'spacebogam.kr';
  // Emergency rollback: set to 'A' and deploy this one file. Empty keeps 50:50 assignment.
  var GLOBAL_EXPERIMENT_VARIANT = '';
  window.__spacebogamHomepageHeadlineVariant = GLOBAL_EXPERIMENT_VARIANT;
  var ATTRIBUTION_KEYS = [
    'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term',
    'gclid', 'gbraid', 'wbraid', 'fbclid', 'msclkid',
    'n_keyword', 'n_query', 'n_campaign_type', 'n_ad_group', 'n_keyword_id',
    'utm_id', 'campaign_id', 'adset_id', 'ad_id', 'asset_id'
  ];
  var CONTEXT_KEYS = [
    'ref', 'variant', 'page_variant', 'is_test'
  ];
  // Channel fields the CTA hardcodes; cleared before relay when inbound attribution exists.
  // 'ref' is deliberately kept: it marks CTA placement, not the acquisition channel.
  var STATIC_CHANNEL_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'];

  function storedAttribution(){
    try {
      var stored = JSON.parse(localStorage.getItem(ATTRIBUTION_KEY) || 'null');
      if (stored && stored.expiresAt > Date.now() && stored.values) return stored.values;
    } catch(error) {}
    return {};
  }

  function hasAttribution(values){
    for (var i = 0; i < ATTRIBUTION_KEYS.length; i++) {
      if (values[ATTRIBUTION_KEYS[i]]) return true;
    }
    return false;
  }

  function currentAttribution(){
    var current = new URL(location.href);
    var stored = storedAttribution();
    var values = {};
    var selfReferral = current.searchParams.get('utm_source') === SELF_REFERRAL_SOURCE;
    ATTRIBUTION_KEYS.forEach(function(key){
      var value = current.searchParams.get(key) || '';
      if (value && (!selfReferral || STATIC_CHANNEL_KEYS.indexOf(key) === -1)) {
        values[key] = value;
      }
    });
    if (selfReferral && hasAttribution(stored)) return stored;
    if (!hasAttribution(values)) return stored;
    try {
      localStorage.setItem(ATTRIBUTION_KEY, JSON.stringify({
        values: values,
        expiresAt: Date.now() + ATTRIBUTION_TTL_MS
      }));
    } catch(error) {}
    return values;
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

  function sessionJourney(){
    var fallback = {
      landing_page: boundedLandingPage(location.href),
      referrer: (document.referrer || '').slice(0, JOURNEY_MAX_LENGTH)
    };
    try {
      var stored = JSON.parse(sessionStorage.getItem(JOURNEY_KEY) || 'null');
      if (stored && stored.landing_page) return stored;
      sessionStorage.setItem(JOURNEY_KEY, JSON.stringify(fallback));
    } catch(error) {}
    return fallback;
  }

  var attribution = currentAttribution();
  var journey = sessionJourney();

  function getNaverId(metaName, fallback){
    var meta = document.querySelector('meta[name="' + metaName + '"]');
    var id = meta && meta.getAttribute('content') ? meta.getAttribute('content').trim() : fallback;
    return id && id !== 'AccountId값' ? id : '';
  }

  function getNaverCtsAccountId(){
    return getNaverId('naver-cts-account-id', NAVER_CTS_ACCOUNT_ID);
  }

  function getNaverAnalyticsAccountId(){
    return getNaverId('naver-analytics-account-id', NAVER_ANALYTICS_ACCOUNT_ID);
  }

  function loadNaverScript(callback){
    if (window.wcs) {
      callback();
      return;
    }
    var existing = document.querySelector('script[data-spacebogam-naver-wcs="1"], script[src*="wcslog.js"]');
    if (existing) {
      existing.addEventListener('load', callback, {once:true});
      return;
    }
    var script = document.createElement('script');
    script.async = true;
    script.src = NAVER_WCS_SCRIPT_SRC;
    script.dataset.spacebogamNaverWcs = '1';
    script.addEventListener('load', callback, {once:true});
    document.head.appendChild(script);
  }

  function initMetaPixel(){
    if (!META_PIXEL_ID) return;
    var alreadyHadFbq = typeof window.fbq === 'function';
    var existingPixelScript = document.querySelector('script[data-spacebogam-meta-pixel="1"], script[src*="connect.facebook.net/en_US/fbevents.js"]');
    if (!window.fbq) {
      var fbq = window.fbq = function(){
        fbq.callMethod ? fbq.callMethod.apply(fbq, arguments) : fbq.queue.push(arguments);
      };
      if (!window._fbq) window._fbq = fbq;
      fbq.push = fbq;
      fbq.loaded = true;
      fbq.version = '2.0';
      fbq.queue = [];
    }
    if (!existingPixelScript) {
      var script = document.createElement('script');
      script.async = true;
      script.src = META_PIXEL_SCRIPT_SRC;
      script.dataset.spacebogamMetaPixel = '1';
      document.head.appendChild(script);
    }
    if (!window.__spacebogamMetaPixelInitialized) {
      window.__spacebogamMetaPixelInitialized = true;
      if (!alreadyHadFbq || !existingPixelScript) window.fbq('init', META_PIXEL_ID);
    }
  }

  function sendMetaPixelEvent(eventName, payload){
    initMetaPixel();
    if (typeof window.fbq === 'function') {
      window.fbq('track', eventName, payload || {});
    }
  }

  function sendMetaPixelCustomEvent(eventName, payload){
    initMetaPixel();
    if (typeof window.fbq === 'function') {
      window.fbq('trackCustom', eventName, payload || {});
    }
  }

  function withNaverAccount(accountId, callback){
    if (!accountId) return;
    loadNaverScript(function(){
      window.wcs_add = window.wcs_add || {};
      window.wcs_add.wa = accountId;
      callback();
    });
  }

  function sendNaverAnalyticsPageView(){
    withNaverAccount(getNaverAnalyticsAccountId(), function(){
      if (!window.__spacebogamNaverAnalyticsPvSent && window.wcs && typeof window.wcs_do === 'function') {
        window.__spacebogamNaverAnalyticsPvSent = true;
        window.wcs_do();
      }
    });
  }

  function sendNaverCtsPageView(){
    withNaverAccount(getNaverCtsAccountId(), function(){
      if (!window.__spacebogamNaverCtsPvSent && window.wcs) {
        window.__spacebogamNaverCtsPvSent = true;
        if (typeof window.wcs.inflow === 'function') window.wcs.inflow(NAVER_CTS_DOMAIN);
        if (typeof window.wcs_do === 'function') window.wcs_do();
      }
    });
  }

  function normalizeExperimentVariant(value){
    if (!value) return '';
    var valueLower = String(value).toLowerCase();
    if (valueLower === 'a' || valueLower === 'home_a' || valueLower === 'home_a_default' || valueLower === 'home_a_current') return 'A';
    if (valueLower === 'b' || valueLower === 'home_b' || valueLower === 'home_b_visit_stage_standard' || valueLower === 'home_b_current') return 'B';
    return '';
  }

  function currentExperimentVariant(storage){
    try {
      if (!storage) return '';
      var stored = storage.getItem(EXPERIMENT_KEY);
      return normalizeExperimentVariant(stored);
    } catch(error) {
      return '';
    }
  }

  function writeExperimentVariant(storage, value){
    if (!storage) return;
    try {
      storage.setItem(EXPERIMENT_KEY, value);
    } catch(error) {}
  }

  function resolveExperimentVariant(storage){
    var globalVariant = normalizeExperimentVariant(GLOBAL_EXPERIMENT_VARIANT);
    if (globalVariant) {
      writeExperimentVariant(storage, globalVariant);
      return globalVariant;
    }
    var forced = '';
    try {
      var forcedParams = new URLSearchParams(location.search);
      forced = normalizeExperimentVariant(
        forcedParams.get('experiment_force') ||
        forcedParams.get('force_experiment') ||
        forcedParams.get('experiment_variant_force')
      );
      if (!forced) {
        forced = normalizeExperimentVariant(localStorage.getItem(FORCE_VARIANT_KEY));
      }
      if (forced) {
        writeExperimentVariant(storage, forced);
        try { localStorage.setItem(FORCE_VARIANT_KEY, forced); } catch(error) {}
      }
    } catch(error) {
      forced = '';
    }
    if (forced) return forced;

    var isHomepage = location.pathname === '/' || location.pathname === '/index.html';
    var params = new URLSearchParams(location.search);
    var variantFromQuery = normalizeExperimentVariant(params.get('experiment_variant'));
    if (!variantFromQuery) variantFromQuery = normalizeExperimentVariant(params.get('variant'));
    if (!variantFromQuery) variantFromQuery = normalizeExperimentVariant(params.get('page_variant'));
    if (variantFromQuery) {
      writeExperimentVariant(storage, variantFromQuery);
      return variantFromQuery;
    }
    if (location.pathname.indexOf('/ab/home-b/') === 0) {
      writeExperimentVariant(storage, 'B');
      return 'B';
    }
    var stored = currentExperimentVariant(storage);
    if (stored) return stored;
    if (isHomepage) {
      var randomValue = Math.random();
      if (window.crypto && typeof window.crypto.getRandomValues === 'function') {
        var randomBytes = new Uint32Array(1);
        window.crypto.getRandomValues(randomBytes);
        randomValue = randomBytes[0] / 4294967296;
      }
      var assigned = randomValue < 0.5 ? 'A' : 'B';
      writeExperimentVariant(storage, assigned);
      return assigned;
    }
    return 'A';
  }

  function getExperimentVariant(){
    return resolveExperimentVariant(sessionStorage);
  }

  function isIntmConsultationUrl(u){
    return u.hostname === 'intm.kr' && u.pathname === '/consultation/ggbg';
  }

  // CMP-173: /consultation/apply/ 는 spacebogam 도메인 안에서 제출까지 끝내는 신규 폼이다.
  // 저장 스냅샷과 URL 릴레이를 함께 유지해 브라우저 저장소 제한이나 중간 홉에도
  // 플랫폼 식별자가 랜딩→폼 이동에서 사라지지 않게 한다.
  var LOCAL_CONSULTATION_PATHS = ['/consultation/', '/consultation', '/consultation/apply/', '/consultation/apply'];

  function isLocalConsultationUrl(u){
    var sameHost = !u.hostname || u.hostname === location.hostname || u.hostname === 'spacebogam.kr' || u.hostname === 'www.spacebogam.kr';
    return sameHost && LOCAL_CONSULTATION_PATHS.indexOf(u.pathname) !== -1;
  }

  function getPageVariant(){
    var experimentVariant = getExperimentVariant();
    if (experimentVariant === 'B') return 'home_b_visit_stage_standard';
    try {
      var current = new URL(location.href);
      var explicit = current.searchParams.get('page_variant') || current.searchParams.get('variant');
      if (explicit) return explicit;
      var content = current.searchParams.get('utm_content');
      if (content && /^home_[ab]_/i.test(content)) return content;
    } catch(e) {}
    var normalizedPath = location.pathname.replace(/\/index\.html$/, '/');
    if (normalizedPath === '/ab/home-b/' || document.body.classList.contains('home-b')) return 'home_b_visit_stage_standard';
    return 'home_a_default';
  }

  function decorate(url){
    try {
      var u = new URL(url, location.href);
      if (!isIntmConsultationUrl(u) && !isLocalConsultationUrl(u)) return url;

      var current = new URL(location.href);
      var inbound = hasAttribution(attribution);
      if (inbound) {
        STATIC_CHANNEL_KEYS.forEach(function(key){ u.searchParams.delete(key); });
      }
      ATTRIBUTION_KEYS.forEach(function(key){
        var value = attribution[key];
        if (value) u.searchParams.set(key, value);
      });
      CONTEXT_KEYS.forEach(function(key){
        var value = current.searchParams.get(key);
        if (value) u.searchParams.set(key, value);
      });

      if (!inbound) {
        if (!u.searchParams.has('utm_source')) u.searchParams.set('utm_source', SOURCE);
        if (!u.searchParams.has('utm_medium')) u.searchParams.set('utm_medium', MEDIUM);
        if (!u.searchParams.has('utm_campaign')) u.searchParams.set('utm_campaign', CAMPAIGN);
      }
      if (!u.searchParams.has('ref')) u.searchParams.set('ref', 'spacebogam');
      u.searchParams.delete('landing_page');
      u.searchParams.delete('source_page');
      if (isLocalConsultationUrl(u)) {
        u.searchParams.delete('referrer');
      } else {
        if (journey.landing_page) u.searchParams.set('landing_page', journey.landing_page);
        if (journey.referrer) u.searchParams.set('referrer', journey.referrer);
      }
      u.searchParams.set('source_page', location.pathname);
      // Experiment enrichment is best-effort: it must never discard the relayed
      // ad attribution above by throwing out of the outer catch.
      try {
        if (!u.searchParams.has('experiment_id')) u.searchParams.set('experiment_id', EXPERIMENT_ID);
        if (!u.searchParams.has('experiment_variant')) u.searchParams.set('experiment_variant', getExperimentVariant());
        if (!u.searchParams.has('page_variant')) u.searchParams.set('page_variant', getPageVariant());
      } catch(e) {}
      return u.toString();
    } catch(e) { return url; }
  }

  function eventPayload(extra){
    var payload = {
      event_category: 'lead',
      event_label: 'spacebogam',
      experiment_id: EXPERIMENT_ID,
      experiment_variant: getExperimentVariant(),
      page_location: location.href,
      page_path: location.pathname,
      page_variant: getPageVariant(),
      source_site: SOURCE
    };
    var current = new URL(location.href);
    ATTRIBUTION_KEYS.forEach(function(key){
      var value = attribution[key];
      if (value) payload[key] = value;
    });
    CONTEXT_KEYS.forEach(function(key){
      var value = current.searchParams.get(key);
      if (value) payload[key] = value;
    });
    Object.keys(extra || {}).forEach(function(key){ payload[key] = extra[key]; });
    return payload;
  }

  function pushDataLayer(eventName, payload){
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push(Object.assign({event: eventName}, payload));
  }

  function sendEvent(eventName, payload){
    pushDataLayer(eventName, payload);
    if (typeof window.gtag === 'function') {
      window.gtag('event', eventName, payload);
    }
  }

  function trackConsultClick(e){
    var a = e.currentTarget;
    var href = decorate(a.getAttribute('href') || '');
    a.setAttribute('href', href);
    var payload = eventPayload({
      event_label: 'spacebogam_consultation',
      link_url: href,
      cta_text: (a.textContent || '').trim(),
      cta_location: a.dataset.ctaLocation || a.className || 'consultation_link'
    });
    sendEvent('click_consultation', payload);
    sendEvent('click_kakao_or_consult', payload);
    sendMetaPixelCustomEvent('click_consultation', payload);
    sendMetaPixelEvent('Contact', payload);
  }

  function pagePhoneContext(){
    var path = location.pathname.replace(/\/index\.html$/, '/');
    var file = path.split('/').filter(Boolean).pop() || 'index.html';
    var isConsultation = path === '/consultation/' || file === 'consultation.html';
    var isPortfolio = file === 'portfolio.html' || path === '/portfolio/';
    var isEstimate = /^estimate(?:-|\.html|\/)/.test(file) || path.indexOf('/estimate') === 0;
    var isLiving = /^living(?:-|\.html|\/)/.test(file) || /pyeong|py/.test(file);
    var isCommercial = /commercial|office|clinic|cafe|shop|hospital/.test(file);
    var isRegion = /interior|remodeling/.test(file) || /dong|gu|busan|haeundae|centum|marine|sajik|jwa|jung|u-|geoje|guseo|hwamyeong|buk/.test(file);
    if (isConsultation) return {key:'consultation', text:'전화로 상담 일정 잡기', location:'consultation_global_call'};
    if (isPortfolio) return {key:'portfolio', text:'비슷한 현장 전화 상담하기', location:'portfolio_global_call'};
    if (isEstimate) return {key:'estimate', text:'견적 범위 전화로 먼저 확인하기', location:'estimate_global_call'};
    if (isLiving) return {key:'living', text:'우리 집 평형 상담하기', location:'living_global_call'};
    if (isCommercial) return {key:'commercial', text:'상업공간 전화 상담하기', location:'commercial_global_call'};
    if (isRegion) return {key:'region', text:'이 지역 공사 조건 전화 상담하기', location:'region_global_call'};
    return {key:'general', text:'전화 상담하기', location:'global_call'};
  }

  function decoratePhoneLink(a, locationName){
    var ctaLocation = locationName || a.dataset.ctaLocation || a.dataset.phoneClickCtaLocation || a.className || 'phone_link';
    a.dataset.ctaLocation = ctaLocation;
    a.dataset.phoneClick = 'phone_click';
    a.dataset.phoneClickPage = window.location.pathname;
    a.dataset.phoneClickCtaLocation = ctaLocation;
  }

  function trackPhoneClick(e){
    var a = e.currentTarget;
    decoratePhoneLink(a);
    var payload = eventPayload({
      event_label: 'spacebogam_call',
      link_url: a.getAttribute('href') || '',
      phone_target: (a.getAttribute('href') || '').replace(/^tel:/, ''),
      cta_text: (a.textContent || '').trim(),
      cta_location: a.dataset.ctaLocation || a.className || 'phone_link',
      phone_click: 'phone_click',
      phone_click_page: location.pathname,
      phone_click_cta_location: a.dataset.ctaLocation || a.className || 'phone_link'
    });
    sendEvent('click_call', payload);
    sendEvent('phone_click', payload);
    sendMetaPixelCustomEvent('click_call', payload);
    sendMetaPixelEvent('Contact', payload);
  }

  function buildPhoneLink(className, locationName, text){
    var a = document.createElement('a');
    a.className = className;
    a.href = 'tel:050713881252';
    decoratePhoneLink(a, locationName);
    a.setAttribute('aria-label', '공간보감 전화 상담 1551-0163');
    a.textContent = text || '전화 상담하기';
    return a;
  }

  function decorateKakaoLink(a, locationName){
    var ctaLocation = locationName || a.dataset.ctaLocation || a.dataset.kakaoChatCtaLocation || a.className || 'kakao_chat_link';
    a.href = KAKAO_CHAT_URL;
    a.dataset.ctaLocation = ctaLocation;
    a.dataset.kakaoChatClick = 'kakao_chat_click';
    a.dataset.kakaoChatPage = window.location.pathname;
    a.dataset.kakaoChatCtaLocation = ctaLocation;
    a.dataset.kakaoChatTarget = KAKAO_CHAT_URL;
  }

  function trackKakaoClick(e){
    var a = e.currentTarget;
    decorateKakaoLink(a);
    var payload = eventPayload({
      event_label: 'spacebogam_kakao_chat',
      link_url: a.getAttribute('href') || KAKAO_CHAT_URL,
      cta_text: (a.textContent || '').trim(),
      cta_location: a.dataset.ctaLocation || a.className || 'kakao_chat_link',
      kakao_chat_click: 'kakao_chat_click',
      kakao_chat_page: location.pathname,
      kakao_chat_cta_location: a.dataset.ctaLocation || a.className || 'kakao_chat_link',
      kakao_chat_target: KAKAO_CHAT_URL
    });
    sendEvent('kakao_chat_click', payload);
    sendEvent('click_kakao_or_consult', payload);
    sendMetaPixelCustomEvent('kakao_chat_click', payload);
    sendMetaPixelEvent('Contact', payload);
  }

  function buildKakaoLink(className, locationName, text){
    var a = document.createElement('a');
    a.className = className;
    decorateKakaoLink(a, locationName);
    a.setAttribute('aria-label', '공간보감 카카오톡 상담');
    a.setAttribute('target', '_blank');
    a.setAttribute('rel', 'noopener');
    a.innerHTML = '<span class="kakao-icon" aria-hidden="true">톡</span><span>' + (text || '카카오톡 상담') + '</span>';
    return a;
  }

  function ensurePhoneCtaStyles(){
    if (document.getElementById('spacebogam-phone-cta-style')) return;
    var style = document.createElement('style');
    style.id = 'spacebogam-phone-cta-style';
    style.textContent = '.spacebogam-header-call,.spacebogam-header-kakao{border-radius:999px;padding:10px 14px;white-space:nowrap;font-weight:700;text-decoration:none;display:inline-flex;align-items:center;gap:7px}.spacebogam-header-call{background:#1b1611;color:#fff;border:1px solid #1b1611}.spacebogam-header-kakao{background:#fee500;color:#191600;border:1px solid #e5cf00}.kakao-icon{display:inline-flex;width:22px;height:22px;border-radius:50%;background:#191600;color:#fee500;align-items:center;justify-content:center;font-size:11px;font-weight:900;line-height:1}.spacebogam-mobile-actions{display:none;position:fixed;left:16px;right:16px;bottom:calc(14px + env(safe-area-inset-bottom));z-index:9999;grid-template-columns:1fr 1fr;gap:8px}.spacebogam-mobile-call,.spacebogam-mobile-kakao{min-height:56px;border-radius:18px;align-items:center;justify-content:center;text-align:center;font-size:16px;font-weight:800;box-shadow:0 18px 45px rgba(45,32,20,.28);border:1px solid rgba(255,255,255,.36);text-decoration:none;display:flex;padding:0 10px}.spacebogam-mobile-call{background:#1b1611;color:#fff}.spacebogam-mobile-call:before{content:"☎";font-size:18px;margin-right:8px}.spacebogam-mobile-kakao{background:#fee500;color:#191600;gap:7px}@media(max-width:600px){body{padding-bottom:92px}.spacebogam-header-call,.spacebogam-header-kakao{display:none}.spacebogam-mobile-actions{display:grid}}';
    document.head.appendChild(style);
  }

  function injectPhoneCtas(){
    if (document.body.dataset.noAutoCta === 'true') return;
    ensurePhoneCtaStyles();
    var context = pagePhoneContext();
    var existingHeaderCall = document.querySelector('.spacebogam-header-call');
    var headerWrap = document.querySelector('.top .wrap');
    if (existingHeaderCall) {
      existingHeaderCall.setAttribute('href', 'tel:050713881252');
      decoratePhoneLink(existingHeaderCall, existingHeaderCall.dataset.ctaLocation || context.location + '_header');
      // 전화번호는 노출하지 않는다 — 버튼 라벨만 유지 (2026-07-04 사장님 지시)
      if ((existingHeaderCall.textContent || '').indexOf('1551-0163') !== -1 || !(existingHeaderCall.textContent || '').trim()) {
        existingHeaderCall.textContent = '전화 상담';
      }
    } else if (headerWrap) {
      existingHeaderCall = buildPhoneLink('spacebogam-header-call', context.location + '_header', '전화 상담');
      var headerConsult = headerWrap.querySelector('.top-cta, .cta');
      if (headerConsult && headerConsult.parentNode === headerWrap) headerWrap.insertBefore(existingHeaderCall, headerConsult.nextSibling);
      else headerWrap.appendChild(existingHeaderCall);
    }

    var existingHeaderKakao = document.querySelector('.spacebogam-header-kakao');
    if (existingHeaderKakao) {
      decorateKakaoLink(existingHeaderKakao, existingHeaderKakao.dataset.ctaLocation || context.location + '_header_kakao');
    } else if (headerWrap) {
      existingHeaderKakao = buildKakaoLink('spacebogam-header-kakao', context.location + '_header_kakao', '카카오톡 상담');
      if (existingHeaderCall && existingHeaderCall.parentNode === headerWrap) headerWrap.insertBefore(existingHeaderKakao, existingHeaderCall.nextSibling);
      else headerWrap.appendChild(existingHeaderKakao);
    }

    var mobileActions = document.querySelector('.spacebogam-mobile-actions');
    if (!mobileActions) {
      mobileActions = document.createElement('div');
      mobileActions.className = 'spacebogam-mobile-actions';
      mobileActions.setAttribute('aria-label', '공간보감 모바일 상담 바로가기');
      document.body.appendChild(mobileActions);
    }
    var mobileCall = mobileActions.querySelector('.spacebogam-mobile-call') || document.querySelector('body > .spacebogam-mobile-call');
    if (mobileCall && mobileCall.parentNode !== mobileActions) mobileActions.appendChild(mobileCall);
    if (!mobileCall) mobileActions.appendChild(buildPhoneLink('spacebogam-mobile-call', context.location + '_mobile_sticky_call', '전화 상담'));
    else decoratePhoneLink(mobileCall, mobileCall.dataset.ctaLocation || context.location + '_mobile_sticky_call');

    var mobileKakao = mobileActions.querySelector('.spacebogam-mobile-kakao');
    if (!mobileKakao) mobileActions.appendChild(buildKakaoLink('spacebogam-mobile-kakao', context.location + '_mobile_sticky_kakao', '카카오톡 상담'));
    else decorateKakaoLink(mobileKakao, mobileKakao.dataset.ctaLocation || context.location + '_mobile_sticky_kakao');
  }

  function init(){
    if (!document.querySelector('script[data-spacebogam-funnel="1"]')) {
      var funnelScript = document.createElement('script');
      funnelScript.src = '/assets/funnel-tracking.js?v=f696d170';
      funnelScript.dataset.spacebogamFunnel = '1';
      document.head.appendChild(funnelScript);
    }
    injectPhoneCtas();

    document.querySelectorAll('a[href^="https://intm.kr/consultation/ggbg"], a[href^="/consultation/"]').forEach(function(a){
      a.setAttribute('href', decorate(a.getAttribute('href')));
      if (!a.dataset.spacebogamTracked) {
        a.addEventListener('click', trackConsultClick, {capture:true});
        a.dataset.spacebogamTracked = '1';
      }
    });

    document.querySelectorAll('a[href^="tel:"]').forEach(function(a){
      decoratePhoneLink(a);
      if (!a.dataset.spacebogamCallTracked) {
        a.addEventListener('click', trackPhoneClick, {capture:true});
        a.dataset.spacebogamCallTracked = '1';
      }
    });

    document.querySelectorAll('a[href*="pf.kakao.com/_UEUBn/chat"], .spacebogam-header-kakao, .spacebogam-mobile-kakao').forEach(function(a){
      decorateKakaoLink(a);
      if (!a.dataset.spacebogamKakaoTracked) {
        a.addEventListener('click', trackKakaoClick, {capture:true});
        a.dataset.spacebogamKakaoTracked = '1';
      }
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
  sendNaverAnalyticsPageView();
  sendNaverCtsPageView();
})();
