/* Commercial sales landing: the ad promise leads to the shared commercial consultation form. */
(function () {
  'use strict';
  var VERTICALS = {
    office: { eyebrow: '부산·경남 사무실 인테리어', headline: ['일하는 방식이 달라지면,', '사무실도 달라져야 하니까.'], lead: '회의실, 집중석, 전기·통신까지. 지금 불편한 점과 이전 계획을 남겨주세요. 기본 조건을 확인한 뒤 사무실 방문 상담에서 공간의 방향을 함께 잡습니다.' },
    shop: { eyebrow: '부산·경남 카페·매장 인테리어', headline: ['오픈을 준비하는 지금,', '공간의 순서부터 잡아보세요.'], lead: '메뉴와 운영 방식, 오픈 희망일을 공간 계획으로 연결합니다. 신청 내용을 바탕으로 먼저 연락드리고, 사무실 방문 상담에서 동선·설비·일정을 함께 살펴봅니다.' }
  };
  var CREATIVE_OVERRIDES = {
    shop_a: { vertical: 'shop', headline: ['오픈일은 정했나요?', '이제 공사의 순서를 잡을 때.'], lead: '광고에서 보신 오픈일 역산, 내 매장에서는 무엇부터 확인해야 할까요? 입점 가능일·공사 가능 시간·설비 조건을 함께 정리하면 지금 결정할 일과 현장에서 확인할 일이 보입니다.' },
    shop_b: { vertical: 'shop', headline: ['예쁜 매장,', '운영도 편해야 하니까.'], lead: '광고에서 보신 설비와 운영 동선 이야기, 내 매장에 맞춰 시작합니다. 주문·픽업·백룸의 흐름과 급배수·환기·전기 조건을 디자인과 함께 살펴봅니다.' },
    office_a: { vertical: 'office', headline: ['입주일은 정해졌는데,', '공사 순서는 막막하다면.'], lead: '좌석 수, 전기·통신, 건물의 공사 가능 시간부터. 광고에서 보신 입주일 기준 계획을 우리 팀의 조건에 맞춰 구체화합니다. 신청 후 기본 조건을 확인하고 사무실 방문 상담을 조율합니다.' },
    office_b: { vertical: 'office', headline: ['좌석만 늘리는 대신,', '일하는 흐름을 바꿉니다.'], lead: '회의실이 부족한지, 집중할 곳이 없는지, 배선이 불편한지. 광고에서 보신 업무 동선부터 우리 팀의 불편을 짚고 회의·집중·협업 공간의 우선순위를 함께 잡습니다.' }
  };
  var AD_CREATIVE_KEYS = {
    '120248665786220650': 'shop_b', '120248665785820650': 'shop_a',
    '120248665785460650': 'office_a', '120248665785690650': 'office_b',
    '120249581919310650': 'shop_a', '120249582136150650': 'shop_a', '120248665890730650': 'shop_a'
  };
  function readCreative(params) {
    var fromId = AD_CREATIVE_KEYS[params.get('ad_id')];
    if (fromId) return fromId;
    var content = (params.get('utm_content') || '').toLowerCase().replace(/[^a-z0-9]+/g, '_');
    return Object.keys(CREATIVE_OVERRIDES).find(function (key) { return new RegExp('(^|_)' + key + '(_|$)').test(content); }) || null;
  }
  function readVertical(params, creativeKey) {
    var direct = (params.get('vertical') || params.get('commercial_vertical') || '').toLowerCase();
    if (VERTICALS[direct]) return direct;
    if (creativeKey) return CREATIVE_OVERRIDES[creativeKey].vertical;
    var tokens = (params.get('utm_content') || '').toLowerCase().split(/[^a-z0-9]+/);
    return tokens.indexOf('shop') >= 0 ? 'shop' : 'office';
  }
  function apply(key, creativeKey) {
    var value = VERTICALS[key]; var creative = CREATIVE_OVERRIDES[creativeKey];
    if (creative && creative.vertical !== key) creative = null;
    document.body.setAttribute('data-commercial-vertical', key);
    if (creative) document.body.setAttribute('data-commercial-creative', creativeKey);
    function text(id, value) { var node = document.getElementById(id); if (node) node.textContent = value; }
    text('cc-eyebrow', value.eyebrow); text('cc-lead', (creative || value).lead);
    var spaceImage = document.getElementById('cc-space-image');
    if (spaceImage) {
      spaceImage.src = '/assets/commercial/' + key + '-concept-20261027.jpg';
      spaceImage.alt = key === 'shop'
        ? '주문 카운터와 창가 좌석 사이의 이동 동선을 표현한 카페 인테리어 예시'
        : '업무석과 유리 회의실 사이의 이동 동선을 표현한 사무실 인테리어 예시';
    }
    text('cc-space-caption', key === 'shop'
      ? '주문부터 픽업까지, 고객과 직원의 움직임이 편하도록.'
      : '업무석과 회의실 사이, 이동을 방해하지 않는 여유.');
    var heading = document.getElementById('cc-headline');
    if (heading) { heading.textContent = ''; (creative || value).headline.forEach(function (line, index) {
      if (index) heading.appendChild(document.createElement('br'));
      heading.appendChild(document.createTextNode(line));
    }); }
    Array.prototype.forEach.call(document.querySelectorAll('[data-vertical-panel]'), function (panel) {
      panel.hidden = panel.getAttribute('data-vertical-panel') !== key;
      if (!panel.hidden) Array.prototype.forEach.call(panel.querySelectorAll('img[data-src]'), function (img) {
        img.src = img.getAttribute('data-src');
      });
    });
    Array.prototype.forEach.call(document.querySelectorAll('[data-vertical-link]'), function (link) {
      var target = new URL(location.href); target.searchParams.set('vertical', link.getAttribute('data-vertical-link'));
      link.href = target.pathname + target.search;
      if (link.getAttribute('data-vertical-link') === key) link.setAttribute('aria-current', 'page');
    });
    document.title = (key === 'shop' ? '카페·매장' : '사무실') + ' 인테리어 상담 신청 | 공간보감';
  }
  function wireSmsCallback() {
    var links = document.querySelectorAll('a.cc-sms[href^="sms:"]');
    Array.prototype.forEach.call(links, function (link) {
      link.addEventListener('click', function () {
        if (window.spacebogamFunnel && typeof window.spacebogamFunnel.send === 'function') {
          window.spacebogamFunnel.send('commercial_callback_click', {
            ctaLocation: link.getAttribute('data-cta-location') || 'commercial_call_sms'
          });
        }
      });
    });
  }

  // CMP-1315: funnel-tracking.js 의 phone_click 과 나란히 나가는 Meta Pixel도 같은
  // 이유로 세션당 1회만 쏴야 한다 — 안 그러면 이 커스텀 이벤트를 보는 최적화·CPL
  // 판단이 CTA 여러 번 클릭에 부풀려진다. sessionStorage 접근이 던지면 열어둔 채
  // 보낸다(막는 게 목적이 아니라 정상 케이스의 중복만 줄이는 것).
  var PHONE_PIXEL_SESSION_KEY = 'spacebogam_commercial_phone_pixel_sent';

  function phonePixelAlreadySent() {
    try {
      return window.sessionStorage && window.sessionStorage.getItem(PHONE_PIXEL_SESSION_KEY) === 'true';
    } catch (error) {
      return false;
    }
  }

  function markPhonePixelSent() {
    try {
      if (window.sessionStorage) window.sessionStorage.setItem(PHONE_PIXEL_SESSION_KEY, 'true');
    } catch (error) {}
  }

  function wireTelPixel() {
    var links = document.querySelectorAll('a[href^="tel:"]');
    Array.prototype.forEach.call(links, function (link) {
      link.addEventListener('click', function () {
        if (typeof window.fbq !== 'function') return;
        if (phonePixelAlreadySent()) return;
        markPhonePixelSent();
        window.fbq('trackCustom', 'phone_click', {
          vertical: document.body.getAttribute('data-commercial-vertical') || 'office',
          cta_location: link.getAttribute('data-cta-location') || 'phone_link',
          phone_target: (link.getAttribute('href') || '').replace(/^tel:/, ''),
          page: location.pathname
        });
      });
    });
  }

  function wireCommercialFormLinks(key) {
    Array.prototype.forEach.call(document.querySelectorAll('[data-commercial-form-link]'), function (link) {
      var target = new URL('/consultation/', location.origin);
      new URLSearchParams(location.search).forEach(function (value, name) { target.searchParams.set(name, value); });
      target.searchParams.set('type', 'commercial');
      target.searchParams.set('vertical', key);
      target.searchParams.set('channel', 'commercial_landing');
      link.href = target.pathname + target.search;
    });
  }

  function init() {
    var params = new URLSearchParams(location.search); var creativeKey = readCreative(params);
    var key = readVertical(params, creativeKey);
    apply(key, creativeKey); wireCommercialFormLinks(key); wireSmsCallback(); wireTelPixel();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
