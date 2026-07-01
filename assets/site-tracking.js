(function(){
  var SOURCE = 'spacebogam.kr';
  var MEDIUM = 'homepage';
  var CAMPAIGN = 'spacebogam_site';
  var NAVER_CTS_ACCOUNT_ID = 's_7702568df18';
  var NAVER_ANALYTICS_ACCOUNT_ID = '183d82ef1dd8190';
  var NAVER_CTS_DOMAIN = 'spacebogam.kr';
  var NAVER_WCS_SCRIPT_SRC = 'https://wcs.pstatic.net/wcslog.js';
  var META_PIXEL_ID = '512750840350337';
  var META_PIXEL_SCRIPT_SRC = 'https://connect.facebook.net/en_US/fbevents.js';
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

  function isIntmConsultationUrl(u){
    return u.hostname === 'intm.kr' && u.pathname === '/consultation/ggbg';
  }

  function isLocalConsultationUrl(u){
    var sameHost = !u.hostname || u.hostname === location.hostname || u.hostname === 'spacebogam.kr' || u.hostname === 'www.spacebogam.kr';
    return sameHost && (u.pathname === '/consultation/' || u.pathname === '/consultation');
  }

  function decorate(url){
    try {
      var u = new URL(url, location.href);
      if (!isIntmConsultationUrl(u) && !isLocalConsultationUrl(u)) return url;

      var current = new URL(location.href);
      ATTRIBUTION_KEYS.forEach(function(key){
        var value = current.searchParams.get(key);
        if (value) u.searchParams.set(key, value);
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
    sendEvent('click_consultation', payload);
    sendEvent('click_kakao_or_consult', payload);
    sendMetaPixelEvent('Lead', payload);
    sendMetaPixelEvent('SubmitApplication', payload);
    sendNaverLead();
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
    if (isCommercial) return {key:'commercial', text:'상업공간 전화 상담하기', location:'commercial_global_call'};
    if (isEstimate) return {key:'estimate', text:'견적 범위 전화로 먼저 확인하기', location:'estimate_global_call'};
    if (isLiving) return {key:'living', text:'우리 집 평형 상담하기', location:'living_global_call'};
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
    sendMetaPixelEvent('Contact', payload);
  }

  function buildPhoneLink(className, locationName, text){
    var a = document.createElement('a');
    a.className = className;
    a.href = 'tel:050713881252';
    decoratePhoneLink(a, locationName);
    a.setAttribute('aria-label', '공간보감 전화 상담 0507-1388-1252');
    a.textContent = text || '전화 상담하기 0507-1388-1252';
    return a;
  }

  function injectPhoneCtas(){
    var context = pagePhoneContext();
    if (!document.querySelector('.spacebogam-header-call')) {
      var headerWrap = document.querySelector('.top .wrap');
      if (headerWrap) {
        var headerCall = buildPhoneLink('spacebogam-header-call', context.location + '_header', '전화 상담');
        var headerConsult = headerWrap.querySelector('.top-cta, .cta');
        if (headerConsult && headerConsult.parentNode === headerWrap) headerWrap.insertBefore(headerCall, headerConsult.nextSibling);
        else headerWrap.appendChild(headerCall);
      }
    }

    if (!document.querySelector('.spacebogam-mobile-call')) {
      document.body.appendChild(buildPhoneLink('spacebogam-mobile-call', context.location + '_mobile_sticky', context.text + ' 0507-1388-1252'));
    }
  }

  function init(){
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
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
  sendNaverAnalyticsPageView();
  sendNaverCtsPageView();
})();
