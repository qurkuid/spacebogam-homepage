(() => {
  const nav = document.querySelector('header nav');
  if (!nav) return;
  const links = [['Q&A','/qna.html'],['고객 후기','/reviews/'],['포트폴리오','/portfolio.html'],['회사소개','/overview.html'],['진행과정','/process.html'],['상업공간','/commercial.html'],['가이드','/guides.html'],['시공 이야기','/insights/']];
  nav.replaceChildren(...links.map(([label,href]) => { const a=document.createElement('a');a.href=href;a.textContent=label;if(location.pathname===href)a.setAttribute('aria-current','page');return a; }));
  nav.setAttribute('aria-label','주요 메뉴');
  nav.id = 'site-navigation';
  nav.classList.add('site-navigation');
  const bar = nav.parentElement;
  bar.classList.add('site-navigation-bar');
  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'site-menu-toggle';
  toggle.setAttribute('aria-controls', nav.id);
  toggle.innerHTML = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M3 6h18M3 12h18M3 18h18"/></svg>';
  nav.before(toggle);
  const setOpen = open => {
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? '메뉴 닫기' : '메뉴 열기');
    nav.classList.toggle('is-open', open);
  };
  setOpen(false);
  toggle.addEventListener('click', () => setOpen(toggle.getAttribute('aria-expanded') !== 'true'));
  nav.addEventListener('click', event => { if (event.target.closest('a')) setOpen(false); });
  document.addEventListener('click', event => { if (!bar.contains(event.target)) setOpen(false); });
  bar.addEventListener('focusout', event => { if (!bar.contains(event.relatedTarget)) setOpen(false); });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && toggle.getAttribute('aria-expanded') === 'true') {
      setOpen(false);
      toggle.focus();
    }
  });
  matchMedia('(max-width: 860px)').addEventListener('change', () => setOpen(false));
})();
