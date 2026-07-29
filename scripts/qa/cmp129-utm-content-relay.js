/**
 * CMP-129 검증 하네스
 * 랜딩 URL의 utm_content(=IG content_id)가 assets/funnel-tracking.js /
 * assets/site-tracking.js 를 거쳐 상담 링크(intm.kr/consultation/ggbg)까지
 * 손실 없이 전달되는지 확인한다.
 *
 * 네트워크 전송(fetch)은 전부 스텁으로 가로채 운영 계측 데이터를 오염시키지 않는다.
 * 실행: node scripts/qa/cmp129-utm-content-relay.js
 */
const fs = require('fs');
const path = require('path');
const {JSDOM} = require('jsdom');

const ROOT = path.resolve(__dirname, '..', '..');
const FUNNEL = fs.readFileSync(path.join(ROOT, 'assets/funnel-tracking.js'), 'utf8');
const SITE = fs.readFileSync(path.join(ROOT, 'assets/site-tracking.js'), 'utf8');
const PAGES = {
  home: fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8'),
  consultation: fs.readFileSync(path.join(ROOT, 'consultation/index.html'), 'utf8')
};
const ATTRIBUTION_KEY = 'spacebogam_funnel_attribution';

function ready(w){
  if (w.document.readyState !== 'loading') return Promise.resolve();
  return new Promise(resolve => w.document.addEventListener('DOMContentLoaded', () => resolve()));
}

async function runCase(name, opts){
  const landingUrl = opts.url;
  const dom = new JSDOM(PAGES[opts.page], {
    url: landingUrl,
    runScripts: 'outside-only',
    pretendToBeVisual: true
  });
  const w = dom.window;
  // 이전 페이지에서 저장된 30일 attribution 을 재현 (홈 → 상담 페이지 이동 시뮬레이션)
  if (opts.storedAttribution) {
    w.localStorage.setItem(ATTRIBUTION_KEY, JSON.stringify({
      values: opts.storedAttribution,
      expiresAt: Date.now() + 86400000
    }));
  }
  const sent = [];
  w.fetch = function(url, init){
    let body = null;
    try { body = init && init.body ? JSON.parse(init.body) : null; } catch(e) {}
    sent.push({url: String(url), body: body});
    return Promise.resolve({ok: true, json: () => Promise.resolve({})});
  };
  w.eval(FUNNEL);
  w.eval(SITE);
  await ready(w);
  await new Promise(resolve => setTimeout(resolve, 50));

  const isConsultLink = href => {
    try {
      const u = new w.URL(href, landingUrl);
      return (u.hostname === 'intm.kr' && u.pathname === '/consultation/ggbg') ||
        (/spacebogam\.kr$/.test(u.hostname) && /^\/consultation\/?$/.test(u.pathname));
    } catch(e) { return false; }
  };
  const anchors = Array.from(w.document.querySelectorAll('a[href]'))
    .filter(a => isConsultLink(a.getAttribute('href')));
  const decorated = anchors.map(a => a.getAttribute('href'));

  // 클릭 시 site-tracking.js 가 다시 한번 decorate 하는 경로도 확인
  const first = anchors[0];
  let afterClick = null;
  if (first) {
    first.dispatchEvent(new w.MouseEvent('click', {bubbles: true, cancelable: true}));
    afterClick = first.getAttribute('href');
  }

  const pick = href => {
    try { return new w.URL(href, landingUrl).searchParams.get('utm_content') || ''; }
    catch(e) { return '(parse error)'; }
  };

  const pageView = sent.find(s => s.body && s.body.eventName === 'page_view');
  const click = sent.find(s => s.body && s.body.eventName === 'consultation_click');

  return {
    case: name,
    landingUrl: landingUrl,
    consultationLinkCount: decorated.length,
    utmContentOnLinks: Array.from(new Set(decorated.map(pick))),
    firstLinkHref: decorated[0] || null,
    intmFormHref: decorated.find(h => /intm\.kr\/consultation\/ggbg/.test(h)) || null,
    hrefAfterClick: afterClick,
    utmContentAfterClick: afterClick ? pick(afterClick) : null,
    pageViewUtmContent: pageView ? pageView.body.utmContent : '(no page_view sent)',
    clickEventUtmContent: click ? click.body.utmContent : '(no consultation_click sent)',
    funnelEventsPosted: sent.filter(s => /funnel-events/.test(s.url)).length
  };
}

const IG_QUERY = 'utm_source=instagram&utm_medium=social&utm_campaign=ig_202608_basement&utm_content=ig-202608-basement-r1';
const IG_ATTRIBUTION = {
  utm_source: 'instagram',
  utm_medium: 'social',
  utm_campaign: 'ig_202608_basement',
  utm_content: 'ig-202608-basement-r1',
  utm_term: ''
};

// qa-entry-url-allow-file: CMP-267 — 아래 URL 들은 JSDOM 안에서만 쓰이는 가짜 랜딩 주소다.
// runCase 가 fetch 를 전부 스텁으로 가로채므로 실제 요청이 나가지 않고 운영 퍼널에 행이 남지 않는다.
// 따라서 is_test 표식이 필요 없다(붙이면 오히려 utm 릴레이 판정 대상이 달라진다).
(async function main(){
  const results = [];
  // 1홉: IG 랜딩(홈) → 상담 링크
  results.push(await runCase('A1. UTM 있음 · 홈 랜딩 → 상담 링크', {
    page: 'home', url: 'https://spacebogam.kr/?' + IG_QUERY
  }));
  // 2홉: 상담 페이지(쿼리 유지) → intm.kr 신청서
  results.push(await runCase('A2. UTM 있음 · 상담 페이지(쿼리 유지) → intm.kr', {
    page: 'consultation', url: 'https://spacebogam.kr/consultation/?' + IG_QUERY
  }));
  // 2홉 최악 케이스: 쿼리 없이 상담 페이지 도착, 저장된 attribution 만으로 복원
  results.push(await runCase('A3. UTM 있음 · 상담 페이지(쿼리 유실) → intm.kr', {
    page: 'consultation', url: 'https://spacebogam.kr/consultation/',
    storedAttribution: IG_ATTRIBUTION
  }));
  // 대조군: UTM 없음
  results.push(await runCase('B1. UTM 없음 · 홈 랜딩 → 상담 링크', {
    page: 'home', url: 'https://spacebogam.kr/'
  }));
  results.push(await runCase('B2. UTM 없음 · 상담 페이지 → intm.kr', {
    page: 'consultation', url: 'https://spacebogam.kr/consultation/'
  }));
  console.log(JSON.stringify(results, null, 2));
})();
