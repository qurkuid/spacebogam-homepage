(() => {
  const nav = document.querySelector('header nav');
  if (!nav) return;
  const links = [['회사소개','/overview.html'],['진행과정','/process.html'],['포트폴리오','/portfolio.html'],['상업공간','/commercial.html'],['가이드','/guides.html'],['시공 이야기','/insights/'],['Q&A','/qna.html']];
  nav.replaceChildren(...links.map(([label,href]) => { const a=document.createElement('a');a.href=href;a.textContent=label;if(location.pathname===href)a.setAttribute('aria-current','page');return a; }));
  nav.setAttribute('aria-label','주요 메뉴');
})();
