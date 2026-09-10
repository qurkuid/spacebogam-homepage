(function(){
  if (window.__spacebogamG4TrackingLoaded) return;
  window.__spacebogamG4TrackingLoaded = true;

  var ATTRIBUTION_KEY = 'spacebogam_funnel_attribution';
  var TEST_KEY = 'spacebogam_funnel_is_test';
  var UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'];
  var TTL = 30 * 24 * 60 * 60 * 1000;

  function storage(name){
    try { return window[name]; } catch(error) { return null; }
  }

  function firstTouch(){
    var local = storage('localStorage');
    try {
      var saved = local && JSON.parse(local.getItem(ATTRIBUTION_KEY) || 'null');
      if (saved && saved.expiresAt > Date.now() && saved.values) return saved.values;
    } catch(error) {}

    var params = new URLSearchParams(location.search);
    var values = {};
    UTM_KEYS.forEach(function(key){
      var value = params.get(key);
      if (value) values[key] = value.slice(0, 200);
    });
    if (local && Object.keys(values).length) {
      try { local.setItem(ATTRIBUTION_KEY, JSON.stringify({values: values, expiresAt: Date.now() + TTL})); } catch(error) {}
    }
    return values;
  }

  function testTraffic(){
    var session = storage('sessionStorage');
    var marked = /^(1|true|yes|y|on)$/i.test(new URLSearchParams(location.search).get('is_test') || '');
    try {
      if (marked && session) session.setItem(TEST_KEY, 'true');
      return marked || !!(session && session.getItem(TEST_KEY) === 'true');
    } catch(error) { return marked; }
  }

  var attribution = firstTouch();
  var isTest = testTraffic();

  function pathOnly(value){
    try { return new URL(value, location.href).pathname.slice(0, 300); } catch(error) { return ''; }
  }

  function track(eventName, link){
    var body = document.body.dataset;
    var data = link ? link.dataset : {};
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push({
      event: eventName,
      event_id: window.crypto && window.crypto.randomUUID ? window.crypto.randomUUID() : String(Date.now()) + Math.random(),
      page_path: location.pathname,
      project: body.project || '',
      placement: data.placement || '',
      link_url: link ? pathOnly(link.href) : '',
      creative_id: attribution.utm_content || data.creative || body.creative || '',
      promise_id: data.promise || body.promise || '',
      landing_id: body.landing || 'g4_private',
      cta_id: data.cta || '',
      utm_source: attribution.utm_source || '',
      utm_medium: attribution.utm_medium || '',
      utm_campaign: attribution.utm_campaign || '',
      utm_content: attribution.utm_content || '',
      is_test: isTest
    });
  }

  document.addEventListener('click', function(event){
    var link = event.target.closest && event.target.closest('[data-event]');
    if (link) track(link.dataset.event, link);
  });

  if (document.body.dataset.page === 'portfolio') track('portfolio_view');
  if (document.body.dataset.page === 'case') track('case_detail_view');

  var gallery = document.querySelector('[data-gallery]');
  if (gallery && window.IntersectionObserver) {
    var observer = new IntersectionObserver(function(entries){
      if (!entries.some(function(entry){ return entry.isIntersecting; })) return;
      observer.disconnect();
      track('case_gallery_view');
    });
    observer.observe(gallery);
  }

  window.__spacebogamG4Track = track;
})();
