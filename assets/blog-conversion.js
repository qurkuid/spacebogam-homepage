(function(){
  var isTest=new URLSearchParams(location.search).get('is_test')||'';
  document.addEventListener('click',function(event){
    var link=event.target.closest('a,button');
    if(!link)return;
    var name=link.dataset.conversionEvent;
    if(!name&&document.body.dataset.conversionPlacement==='blog_list'&&link.closest('.post-card')&&/\/blog\/[^/]+\.html$/.test(link.pathname))name='blog_post_open';
    if(!name)return;
    var story=(link.dataset.storyId||link.pathname.match(/\/blog\/([^/]+)\.html$/)?.[1]||'');
    try{story=decodeURIComponent(story)}catch(error){}
    var mappedCase=/^(224195906561|224254948259)-/.test(story)?'case-daewoo-ian-35py':'';
    window.dataLayer=window.dataLayer||[];
    window.dataLayer.push({
      event:name,
      page_path:location.pathname,
      link_url:link.getAttribute('href')||'',
      story_id:story,
      case_id:link.dataset.caseId||mappedCase,
      placement:document.body.dataset.conversionPlacement||'',
      device_class:matchMedia('(max-width:720px)').matches?'mobile':'desktop',
      is_test:isTest
    });
  });
})();
