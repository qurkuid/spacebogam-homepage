(function () {
  'use strict';
  var section = document.querySelector('.rv-home');
  if (!section) return;
  var track = section.querySelector('.rv-home-track');
  var status = section.querySelector('.rv-home-status');
  var buttons = section.querySelectorAll('[data-review-direction]');
  var pending = false;
  var previous = '';
  var starPath = 'm12 3 2.78 5.63L21 9.54l-4.5 4.39 1.06 6.2L12 17.2l-5.56 2.93 1.06-6.2L3 9.54l6.22-.91Z';

  // Edited highlights stay valid only while their supporting customer statements remain.
  var marketingSummaries = {
    "f864db7d-328a-46d4-ba91-8ad8b72eea2d": {
      "evidence": [
        "창호도 세 곳의 설명을 듣고 나니 이제야 비교가 좀 되더라고요.",
        "현장과 가까운 곳이면 자주 만나고 이야기도 빨리 나눌 수 있어서 그 점을 중요하게 봤어요."
      ],
      "text": "창호 설명을 비교하면서 선택 기준을 잡을 수 있었어요. 현장 가까이에서 자주 만나고 빠르게 소통할 수 있다는 점도 중요하게 봤어요."
    },
    "fde59acc-9158-4257-beaf-297a6cbb0f83": {
      "evidence": [
        "좋은 점만이 아니라 불편한 점도 솔직하게 말씀해 주셔서 감사했어요.",
        "특히 침실을 나눠 각자 편하게 자는 방법은 수면의 질을 생각하면 참 괜찮겠더라고요.",
        "이야기를 나누고 안내해 주신 일정으로 예약을 잡기로 했어요."
      ],
      "text": "솔직하게 설명해 주셔서 감사했어요. 수면의 질까지 생각해 침실을 나눠 쓰는 방법을 함께 이야기했는데, 제 생활에 잘 맞겠더라고요. 상담 후 안내받은 일정으로 예약하기로 했어요."
    },
    "679f8040-cbb3-4108-8ea6-c4a226238ba8": {
      "evidence": [
        "제 이야기를 듣고 원하는 방향으로 풀어주시니 도움이 됐고요.",
        "천장을 낮추는 공사를 안 해도 된다는 말을 들었을 때는 다행이다 싶었어요.",
        "상담 내용을 살펴본 뒤 계약을 진행하기로 했습니다."
      ],
      "text": "제 이야기를 듣고 원하는 방향으로 풀어주셔서 도움이 됐어요. 천장을 낮추는 공사를 하지 않아도 된다는 설명도 반가웠고요. 상담 내용을 살펴본 뒤 계약을 진행하기로 했어요."
    },
    "9d278c16-3d92-42bd-bee0-99bfe7adf19e": {
      "evidence": [
        "전체 구조와 보조 주방은 마음에 드는데 메인 주방이 좀 아쉬워서, 그 부분을 바꿔보고 싶었어요.",
        "세탁실 배관이 가능할 수도 있다고 하셔서 감사했고, 욕실 배관은 무리하게 옮기지 않고 두는 쪽으로 이야기했어요.",
        "상담하시는 마음가짐이 좋아 보여 처음부터 우선으로 생각했던 곳이에요."
      ],
      "text": "바꾸고 싶었던 메인 주방을 중심으로 상담했어요. 세탁실 배관의 가능성을 짚고, 욕실 배관은 무리하게 옮기지 않는 방향으로 함께 이야기했어요. 상담하시는 마음가짐이 좋아 처음부터 우선으로 생각했던 곳이에요."
    },
    "296273c8-6974-43bf-8988-624f64b51afc": {
      "evidence": [
        "가스 때문에 고민하던 게 있었는데 인덕션과 오븐 조합을 보니 해결되겠더라고요.",
        "배관 자리도 사진과 도면으로 다시 확인하시는 걸 보고 꼼꼼하시다고 말씀드렸어요.",
        "스케치만 봐도 완성됐을 때 분위기가 그려져서 전체 구성은 마음에 들었어요."
      ],
      "text": "가스 사용으로 고민하던 부분이 인덕션과 오븐 조합을 보니 해결되겠더라고요. 배관 자리도 사진과 도면으로 다시 확인해 주셔서 꼼꼼하다고 느꼈어요. 스케치만 봐도 완성될 집의 분위기가 그려져 전체 구성이 마음에 들었어요."
    }
  };

  function controls() {
    buttons[0].disabled = track.scrollLeft < 2;
    buttons[1].disabled = track.scrollLeft + track.clientWidth >= track.scrollWidth - 2;
  }

  function card(review) {
    var article = document.createElement('article');
    article.className = 'rv-home-card';
    article.setAttribute('role', 'listitem');
    var stars = document.createElement('div');
    stars.className = 'rv-home-stars';
    stars.setAttribute('role', 'img');
    stars.setAttribute('aria-label', (review.sourceLabel && review.sourceLabel.includes('편집 평점') ? '편집 평점' : '평점') + ' 5점 만점에 ' + review.rating + '점');
    for (var i = 0; i < 5; i++) {
      var star = document.createElement('span');
      star.className = 'rv-home-star';
      star.setAttribute('aria-hidden', 'true');
      star.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="' + starPath + '"/></svg><svg class="rv-home-star-fill" viewBox="0 0 24 24" fill="currentColor"><path d="' + starPath + '"/></svg>';
      star.lastChild.style.clipPath = 'inset(0 ' + (100 - Math.max(0, Math.min(1, review.rating - i)) * 100) + '% 0 0)';
      stars.appendChild(star);
    }
    var summary = document.createElement('p');
    summary.className = 'rv-home-summary';
    var highlight = marketingSummaries[review.id];
    var supported = highlight && highlight.evidence.every(function (statement) { return review.body.includes(statement); });
    summary.textContent = supported ? highlight.text : (review.title || review.body).split(' · ')[0].trim();
    var customer = document.createElement('p');
    customer.className = 'rv-home-customer';
    customer.appendChild(document.createTextNode(review.nickname + ' 고객님'));
    var home = document.createElement('span');
    home.textContent = (review.apartmentName || '아파트명 미등록') + ' · ' + (review.areaBand || '평형대 미등록');
    customer.appendChild(home);
    article.append(stars, summary, customer);
    return article;
  }

  async function refresh() {
    if (pending || document.hidden) return;
    pending = true;
    try {
      var response = await fetch('/api/reviews?sort=highest', { cache: 'no-store' });
      if (!response.ok) throw new Error('Reviews unavailable');
      var data = await response.json();
      if (!Array.isArray(data.reviews)) throw new Error('Invalid reviews');
      var reviews = data.reviews.filter(function (review) { return review.id !== '60dcc645-b258-4858-8a45-549a35bcbfcf'; }).slice(0, 5);
      var signature = JSON.stringify(reviews);
      if (signature !== previous) {
        var cards = reviews.map(card);
        track.replaceChildren.apply(track, cards);
        track.scrollLeft = 0;
        previous = signature;
      }
      status.hidden = reviews.length > 0;
      status.textContent = reviews.length ? '' : '공개된 고객 후기가 아직 없습니다.';
      controls();
    } catch (error) {
      status.hidden = false;
      status.textContent = '고객 후기를 불러오지 못했습니다. 잠시 후 다시 확인해 주세요.';
    } finally {
      pending = false;
    }
  }

  buttons.forEach(function (button) {
    button.addEventListener('click', function () {
      var first = track.firstElementChild;
      if (first) track.scrollBy({ left: Number(button.dataset.reviewDirection) * (first.getBoundingClientRect().width + parseFloat(getComputedStyle(track).gap)) });
    });
  });
  track.addEventListener('scroll', controls, { passive: true });
  window.addEventListener('resize', controls);
  document.addEventListener('visibilitychange', refresh);
  window.addEventListener('pageshow', refresh);
  setInterval(refresh, 60000);
  refresh();
}());
