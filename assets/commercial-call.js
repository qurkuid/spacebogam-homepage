/* CMP-1312/1315/1322 상업공간 전화상담 랜딩 — 업종 variant 스위치
 *
 * 업종(commercial_vertical)은 utm_content 앞부분에서 읽는다.
 *   utm_content = "<vertical>__<creative>"   예) office__a1_condition
 * ?vertical=office 로도 직접 지정할 수 있다(QA·미리보기용).
 *
 * 왜 utm_content 인가:
 *   spacebogam_funnel_events.page_variant 는 funnel-tracking.js 가 홈 A/B 버킷으로
 *   덮어쓴다(항상 home_a_default / home_b_visit_stage_standard). 업종을 거기 실으면
 *   유실된다. utm_content 는 수집기가 원문 그대로 저장하므로 업종 분해가 가능하다.
 *
 * phone_click 은 funnel-tracking.js 가 tel: 링크 클릭에서 자동 전송한다.
 * data-cta-location 값이 ctaLocation 으로 그대로 들어간다.
 * 연결 실패용 콜백 폼은 assets/commercial-call-callback.js 가 별도로 담당한다
 * (성함/연락처만 받는 최소 폼, lead_form_view/lead_form_start/lead_submit_success —
 * 전부 기존 DB CHECK 열거형에 있는 이름만 쓴다. 새 이름 추가·마이그레이션 불필요).
 *
 * CMP-1313 전략 정본 (CMP-1322 반영):
 *   - 1차 업종은 office 단독이 기본값이다. 파라미터가 없거나 알 수 없는 값이면
 *     office 로 진입한다(더 이상 일반 카피로 남겨두지 않는다).
 *   - clinic(병원·의원)은 CMP-1312 확인카드 69695e54-e188-417d-870a-820287e18eb5
 *     응답이 B안(사무실+병원)일 때만 켠다. 카드가 pending 인 동안은 HOSPITAL_ENABLED=false
 *     로 막아 두고, clinic 요청은 office 로 폴백한다. 응답이 오면 이 상수만 뒤집는다.
 *   - 미용실·필라테스는 VERTICALS 에 없다 — 정본에서 1차 범위 제외됐으므로 추가하지 않는다.
 *
 * sms: 콜백 링크 (.cc-sms, commercial/call/index.html) 클릭 계측:
 *   intm spacebogam_funnel_events_event_name_check CHECK 제약에 commercial_callback_click
 *   이 없어 그동안 400 이 났다. intm PR #61 로 열거형에 추가됐으므로 여기서 전송을 켠다.
 *   FUNNEL_ALLOWED 클라 허용목록은 preview-v8.js 전용이고 이 페이지는 그 스크립트를
 *   로드하지 않는다 — window.spacebogamFunnel.send() 를 직접 호출하면 게이트 없이 나간다.
 */
(function () {
  'use strict';

  var HOSPITAL_ENABLED = false;

  var VERTICALS = {
    clinic: {
      eyebrow: '부산 병원·의원 인테리어',
      lead: '진료과목, 전용면적, 오픈 희망일, 그리고 급배수·환기·소방·의료가스 조건을 먼저 확인해야 공사 범위와 일정이 잡힙니다. 조건 확인 없이 금액부터 말씀드리지 않습니다.',
      whyTitle: '대기·상담·진료 동선을 먼저 나눕니다',
      cards: [
        ['설비 조건', '전기 용량, 급배수, 환기, 소방, 냉난방 위치를 도면보다 먼저 확인합니다.'],
        ['오픈 일정', '의료기관 개설 신고와 입점 가능일에 맞춰 공정을 역산합니다.'],
        ['환자·직원 동선', '대기, 접수, 상담, 진료, 수납 흐름과 프라이버시를 함께 봅니다.']
      ],
      askItems: [
        ['진료과목', '운영 방식에 따라 대기·진료 동선이 달라집니다'],
        ['전용면적', '층수와 엘리베이터 유무'],
        ['오픈 희망일', '의료기관 개설 신고 일정과 맞물립니다'],
        ['급배수·환기·소방·의료가스', '개설 신고 심사 항목과 직결됩니다']
      ]
    },
    office: {
      eyebrow: '부산 사무실 인테리어',
      lead: '인원수, 전용면적, 입주 희망일, 그리고 전기·통신·공조·소방 조건을 먼저 확인해야 공사 범위와 일정이 잡힙니다. 조건 확인 없이 금액부터 말씀드리지 않습니다.',
      whyTitle: '업무 방식과 전기·통신 계획을 먼저 맞춥니다',
      cards: [
        ['설비 조건', '전기 용량, 통신·네트워크, 공조, 소방, 냉난방 위치를 도면보다 먼저 확인합니다.'],
        ['입주 일정', '건물 관리규정과 야간·주말 공사 가능 여부에 맞춰 공정을 역산합니다.'],
        ['업무 동선', '고정석, 회의실, 집중석, 라운지 비율이 입주 이후 운영을 결정합니다.']
      ],
      askItems: [
        ['좌석 수', '좌석 배치와 필요 면적을 좌우합니다'],
        ['회의실', '규모·개수와 방음·화상회의 조건'],
        ['전기·통신', '전기 용량과 통신·네트워크 배선'],
        ['이전 희망일', '건물 관리규정과 공정 일정']
      ]
    },
    shop: {
      eyebrow: '부산 카페·매장 인테리어',
      lead: '업종, 전용면적, 오픈 희망일, 그리고 전기·급배수·환기·소방·간판 조건을 먼저 확인해야 공사 범위와 일정이 잡힙니다. 조건 확인 없이 금액부터 말씀드리지 않습니다.',
      whyTitle: '고객 동선과 주방·백룸 설비를 먼저 맞춥니다',
      cards: [
        ['설비 조건', '전기 용량, 급배수, 후드·환기, 소방, 간판·파사드를 도면보다 먼저 확인합니다.'],
        ['오픈 일정', '영업신고, 입점 가능일, 야간 공사 가능 여부에 맞춰 공정을 역산합니다.'],
        ['고객·직원 동선', '입구, 주문, 픽업, 좌석, 백룸 흐름이 체류 시간과 운영 피로도를 좌우합니다.']
      ],
      askItems: [
        ['업종', '운영 방식에 따라 동선과 설비가 달라집니다'],
        ['면적', '전용면적과 층수, 엘리베이터 유무'],
        ['오픈 희망일', '영업신고와 공정 일정'],
        ['급배수', '주방·화장실 배관 조건'],
        ['환기', '후드·덕트 설치 가능 여부'],
        ['전기', '전기 용량과 배선 조건'],
        ['소방', '소방시설 설치 기준'],
        ['간판', '간판·파사드 규정'],
        ['동선', '입구·주문·픽업·좌석 흐름']
      ]
    }
  };

  function isAllowed(key) {
    if (!VERTICALS[key]) return false;
    if (key === 'clinic' && !HOSPITAL_ENABLED) return false;
    return true;
  }

  function readVertical() {
    var params;
    try {
      params = new URLSearchParams(location.search);
    } catch (error) {
      return null;
    }
    var direct = (params.get('vertical') || '').toLowerCase().trim();
    if (isAllowed(direct)) return direct;

    var content = (params.get('utm_content') || '').toLowerCase().trim();
    var prefix = content.split('__')[0];
    if (isAllowed(prefix)) return prefix;
    return null;
  }

  function setText(id, value) {
    var node = document.getElementById(id);
    if (node) node.textContent = value;
  }

  function apply(key) {
    var v = VERTICALS[key];
    if (!v) return;

    document.body.setAttribute('data-commercial-vertical', key);
    setText('cc-eyebrow', v.eyebrow);
    setText('cc-lead', v.lead);
    setText('cc-why-title', v.whyTitle);

    var wrap = document.getElementById('cc-why-cards');
    if (wrap) {
      wrap.innerHTML = '';
      v.cards.forEach(function (pair) {
        var article = document.createElement('article');
        article.className = 'card';
        var b = document.createElement('b');
        b.textContent = pair[0];
        var p = document.createElement('p');
        p.textContent = pair[1];
        article.appendChild(b);
        article.appendChild(p);
        wrap.appendChild(article);
      });
    }

    var askItems = v.askItems || [];
    setText('cc-ask-title', '이 ' + askItems.length + '가지를 확인하면 공사 범위가 잡힙니다');
    var askList = document.getElementById('cc-asklist');
    if (askList) {
      askList.innerHTML = '';
      askItems.forEach(function (pair) {
        var li = document.createElement('li');
        var b = document.createElement('b');
        b.textContent = pair[0];
        var span = document.createElement('span');
        span.textContent = pair[1];
        li.appendChild(b);
        li.appendChild(span);
        askList.appendChild(li);
      });
    }

    var title = {
      clinic: '부산 병원·의원 인테리어 전화 상담 | 공간보감',
      office: '부산 사무실 인테리어 전화 상담 | 공간보감',
      shop: '부산 카페·매장 인테리어 전화 상담 | 공간보감'
    }[key];
    if (title) document.title = title;
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

  function init() {
    var key = readVertical() || 'office';
    apply(key);
    wireSmsCallback();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
