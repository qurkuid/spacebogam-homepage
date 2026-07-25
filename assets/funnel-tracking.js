(function(){
  var ENDPOINT = 'https://intm.kr/api/marketing/funnel-events';
  var CLIENT_KEY = 'spacebogam_funnel_client_id';
  var SESSION_KEY = 'spacebogam_funnel_session_id';
  var ATTRIBUTION_KEY = 'spacebogam_funnel_attribution';
  var ATTRIBUTION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
  var UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'];

  function uuid(){
    if (window.crypto && typeof window.crypto.randomUUID === 'function') {
      return window.crypto.randomUUID();
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

  function pageVariant(){
    var params = new URLSearchParams(location.search);
    var explicit = params.get('page_variant') || params.get('variant');
    if (explicit) return explicit;
    if (location.pathname.indexOf('/ab/home-b/') === 0) return 'home_b_visit_stage_standard';
    return 'home_a_default';
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
