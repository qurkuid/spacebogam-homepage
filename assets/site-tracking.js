(function(){
  var SOURCE = 'spacebogam.kr';
  var MEDIUM = 'homepage';
  var CAMPAIGN = 'spacebogam_site';
  function decorate(url){
    try {
      var u = new URL(url, location.href);
      if (u.hostname !== 'intm.kr' || u.pathname !== '/consultation/ggbg') return url;
      if (!u.searchParams.has('utm_source')) u.searchParams.set('utm_source', SOURCE);
      if (!u.searchParams.has('utm_medium')) u.searchParams.set('utm_medium', MEDIUM);
      if (!u.searchParams.has('utm_campaign')) u.searchParams.set('utm_campaign', CAMPAIGN);
      if (!u.searchParams.has('ref')) u.searchParams.set('ref', 'spacebogam');
      return u.toString();
    } catch(e) { return url; }
  }
  function trackClick(e){
    var a = e.currentTarget;
    var href = decorate(a.getAttribute('href') || '');
    a.setAttribute('href', href);
    if (typeof window.gtag === 'function') {
      window.gtag('event', 'consultation_click', {
        event_category: 'lead',
        event_label: 'spacebogam_consultation',
        link_url: href,
        page_location: location.href
      });
    }
  }
  function init(){
    document.querySelectorAll('a[href^="https://intm.kr/consultation/ggbg"]').forEach(function(a){
      a.setAttribute('href', decorate(a.getAttribute('href')));
      if (!a.dataset.spacebogamTracked) {
        a.addEventListener('click', trackClick, {capture:true});
        a.dataset.spacebogamTracked = '1';
      }
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
