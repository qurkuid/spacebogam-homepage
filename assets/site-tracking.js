(function(){
  var SOURCE = 'spacebogam.kr';
  var MEDIUM = 'homepage';
  var CAMPAIGN = 'spacebogam_site';
  var NAVER_CTS_ACCOUNT_ID = 's_7702568df18';
  var NAVER_ANALYTICS_ACCOUNT_ID = '183d82ef1dd8190';
  var NAVER_CTS_DOMAIN = 'spacebogam.kr';
  var NAVER_WCS_SCRIPT_SRC = 'https://wcs.pstatic.net/wcslog.js';
  var ATTRIBUTION_KEYS = [
    'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
    'gclid', 'gbraid', 'wbraid', 'fbclid', 'n_keyword', 'ref'
  ];

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

  function sendNaverLead(){
    withNaverAccount(getNaverCtsAccountId(), function(){
      if (window.wcs && typeof window.wcs.trans === 'function') {
        window.wcs.trans({type: 'lead'});
      }
    });
  }

  function decorate(url){
    try {
      var u = new URL(url, location.href);
      if (u.hostname !== 'intm.kr' || u.pathname !== '/consultation/ggbg') return url;

      var current = new URL(location.href);
      ATTRIBUTION_KEYS.forEach(function(key){
        var value = current.searchParams.get(key);
        if (value && !u.searchParams.has(key)) u.searchParams.set(key, value);
      });

      if (!u.searchParams.has('utm_source')) u.searchParams.set('utm_source', SOURCE);
      if (!u.searchParams.has('utm_medium')) u.searchParams.set('utm_medium', MEDIUM);
      if (!u.searchParams.has('utm_campaign')) u.searchParams.set('utm_campaign', CAMPAIGN);
      if (!u.searchParams.has('ref')) u.searchParams.set('ref', 'spacebogam');
      return u.toString();
    } catch(e) { return url; }
  }

  function eventPayload(extra){
    var payload = {
      event_category: 'lead',
      event_label: 'spacebogam',
      page_location: location.href,
      page_path: location.pathname,
      source_site: SOURCE
    };
    var current = new URL(location.href);
    ATTRIBUTION_KEYS.forEach(function(key){
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
    sendEvent('generate_lead', payload);
    sendEvent('click_kakao_or_consult', payload);
    sendNaverLead();
  }

  function trackPhoneClick(e){
    var a = e.currentTarget;
    var payload = eventPayload({
      event_label: 'spacebogam_call',
      link_url: a.getAttribute('href') || '',
      phone_target: (a.getAttribute('href') || '').replace(/^tel:/, ''),
      cta_text: (a.textContent || '').trim(),
      cta_location: a.dataset.ctaLocation || a.className || 'phone_link'
    });
    sendEvent('click_call', payload);
  }

  function init(){
    document.querySelectorAll('a[href^="https://intm.kr/consultation/ggbg"]').forEach(function(a){
      a.setAttribute('href', decorate(a.getAttribute('href')));
      if (!a.dataset.spacebogamTracked) {
        a.addEventListener('click', trackConsultClick, {capture:true});
        a.dataset.spacebogamTracked = '1';
      }
    });

    document.querySelectorAll('a[href^="tel:"]').forEach(function(a){
      if (!a.dataset.spacebogamCallTracked) {
        a.addEventListener('click', trackPhoneClick, {capture:true});
        a.dataset.spacebogamCallTracked = '1';
      }
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
  sendNaverAnalyticsPageView();
  sendNaverCtsPageView();
})();
