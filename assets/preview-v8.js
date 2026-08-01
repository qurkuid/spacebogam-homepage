(function(){
  var isTest=new URLSearchParams(location.search).get('is_test')||'';
  document.addEventListener('click',function(event){
    var target=event.target.closest('[data-v8-event]');
    if(!target)return;
    window.dataLayer=window.dataLayer||[];
    window.dataLayer.push({
      event:target.dataset.v8Event,
      page_path:location.pathname,
      link_url:target.getAttribute('href')||'',
      project:target.dataset.project||'',
      is_test:isTest
    });
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
