(function(){
  var ENDPOINT = 'https://intm.kr/api/marketing/funnel-events';
  var CLIENT_KEY = 'spacebogam_funnel_client_id';
  var SESSION_KEY = 'spacebogam_funnel_session_id';
  var ATTRIBUTION_KEY = 'spacebogam_funnel_attribution';
  var EXPERIMENT_ID = 'homepage_headline_v1';
  var EXPERIMENT_KEY = 'spacebogam_homepage_headline_v1_variant';
  var FORCE_VARIANT_KEY = 'spacebogam_headline_v1_force_variant';
  var ATTRIBUTION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
  var UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'];

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

  var local = browserStorage('localStorage');
  var session = browserStorage('sessionStorage');
  var clientId = storedId(local, CLIENT_KEY);
  var sessionId = storedId(session, SESSION_KEY);
  var attribution = currentAttribution(local);
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
      experiment_id: EXPERIMENT_ID,
      experimentId: EXPERIMENT_ID,
      experiment_variant: experimentVariant,
      experimentVariant: experimentVariant,
      ctaLocation: detail && detail.ctaLocation || '',
      ctaText: detail && detail.ctaText || '',
      pageVariant: pageVariant(),
      deviceType: deviceType()
    };
    if (detail && typeof detail.scrollDepth === 'number') payload.scrollDepth = detail.scrollDepth;
    if (detail && typeof detail.engagedSeconds === 'number') payload.engagedSeconds = detail.engagedSeconds;
    fetch(ENDPOINT, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(payload),
      keepalive: true
    }).catch(function(){});
  }

  function isConsultationUrl(url){
    return (
      (url.hostname === 'intm.kr' && url.pathname === '/consultation/ggbg') ||
      ((url.hostname === location.hostname || !url.hostname) &&
        (url.pathname === '/consultation/' || url.pathname === '/consultation'))
    );
  }

  function decorateConsultationLink(anchor){
    try {
      var url = new URL(anchor.getAttribute('href') || '', location.href);
      if (!isConsultationUrl(url)) return;
      UTM_KEYS.forEach(function(key){
        if (attribution[key] && !url.searchParams.has(key)) {
          url.searchParams.set(key, attribution[key]);
        }
      });
      url.searchParams.set('sbClientId', clientId);
      url.searchParams.set('sbSessionId', sessionId);
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
