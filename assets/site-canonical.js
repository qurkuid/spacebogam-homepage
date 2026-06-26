(function(){
  var targetHost = 'spacebogam.kr';
  var targetPath = location.pathname === '/index.html' ? '/' : location.pathname;
  if (
    location.hostname === 'www.spacebogam.kr' ||
    (location.protocol === 'http:' && /(^|\.)spacebogam\.kr$/.test(location.hostname)) ||
    location.pathname === '/index.html'
  ) {
    location.replace('https://' + targetHost + targetPath + location.search + location.hash);
  }
})();
