(function(){
  var targetHost = 'spacebogam.kr';
  if ((location.hostname === 'www.spacebogam.kr') || (location.protocol === 'http:' && /(^|\.)spacebogam\.kr$/.test(location.hostname))) {
    location.replace('https://' + targetHost + location.pathname + location.search + location.hash);
  }
})();
