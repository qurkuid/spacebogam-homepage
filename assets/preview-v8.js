(function(){
  var isTest=new URLSearchParams(location.search).get('is_test')||'';

  // CMP-1038: intm 수집기(funnel-events)가 이름을 서버 스키마+DB CHECK 로 검증한다.
  // 여기 없는 이름을 보내면 전량 400 이므로, 미등록 이름은 GA4 로만 보낸다.
  // 2026-08-22 실측 기준 202 로 수용되는 이름들.
  var FUNNEL_ALLOWED={
    home_portfolio_cta_click:1,
    portfolio_project_open:1,
    portfolio_consult_click:1,
    blog_case_open:1,
    case_consult_click:1
  };

  document.addEventListener('click',function(event){
    var target=event.target.closest('[data-v8-event]');
    if(!target)return;
    var name=target.dataset.v8Event;
    var linkUrl=target.getAttribute('href')||'';
    var project=target.dataset.project||'';

    window.dataLayer=window.dataLayer||[];
    window.dataLayer.push({
      event:name,
      page_path:location.pathname,
      link_url:linkUrl,
      project:project,
      is_test:isTest
    });

    // GA4 로 직접 보낸다. dataLayer.push 는 GTM 전용이라, GTM 태그가 게시되지
    // 않으면 GA4 에도 아무것도 도착하지 않는다 — 이 한 줄이 그 의존을 끊는다.
    try{
      if(typeof window.gtag==='function'){
        window.gtag('event',name,{
          event_category:'v8_engagement',
          page_path:location.pathname,
          link_url:linkUrl,
          project:project,
          is_test:isTest
        });
      }
    }catch(error){}

    // 등록된 이름은 내부 수집기(퍼널 리포트 정본)로도 함께 보낸다.
    try{
      if(FUNNEL_ALLOWED[name]&&window.spacebogamFunnel&&typeof window.spacebogamFunnel.send==='function'){
        window.spacebogamFunnel.send(name,{
          ctaLocation:target.dataset.ctaLocation||target.className||'v8_cta',
          ctaText:(target.textContent||'').trim().slice(0,120)
        });
      }
    }catch(error){}
  });

  var filters=document.querySelectorAll('[data-filter]');
  if(!filters.length)return;
  filters.forEach(function(button){
    button.addEventListener('click',function(){
      var selected=button.dataset.filter;
      var visible=0;
      filters.forEach(function(item){item.setAttribute('aria-pressed',item===button?'true':'false')});
      document.querySelectorAll('[data-kind]').forEach(function(card){
        card.hidden=selected!=='all'&&card.dataset.kind!==selected;
        if(!card.hidden)visible++;
      });
      document.querySelector('.v8-empty').hidden=visible>0;
    });
  });
})();
