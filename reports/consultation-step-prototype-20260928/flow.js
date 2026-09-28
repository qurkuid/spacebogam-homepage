(function () {
  const nodes = {
    type: { title: '어떤 공간을 바꾸실 계획인가요?', lead: '가장 가까운 항목을 골라주세요.', options: ['주거 공간', '상업 공간'] },
    housing: { title: '어떤 주거 공간인가요?', lead: '아파트라면 단지 정보로 도면 후보를 찾아볼게요.', options: ['아파트', '주택·빌라·기타'] },
    apartmentQuery: { title: '아파트를 찾아볼까요?', lead: '아파트 이름이나 도로명주소로 검색한 뒤 단지를 선택해 주세요.', label: '아파트 이름 또는 주소', placeholder: '예: 거제유림아시아드 또는 해맞이로 23', hint: '부산 단지 목록에 없거나 도면이 없으면 주소로 전체 도면 목록을 다시 조회합니다.' },
    dong: { title: '아파트 몇 동인가요?', lead: '해당 단지의 동을 선택해 주세요.', label: '동', placeholder: '예: 101동' },
    planReview: { title: '도면을 확인해 주세요', lead: '도면을 크게 보고 방향을 맞춘 뒤 저장하거나 직접 업로드할 수 있습니다.' },
    consent: { title: '상담 준비를 마칠까요?', lead: '답변을 확인하기 전에 개인정보 수집·이용에 동의해 주세요.' },
    summary: { title: '입력 내용을 확인해 주세요', lead: '내용이 맞으면 상담 신청을 접수해 주세요.' },
    success: { title: '상담 신청이 접수되었습니다', lead: '담당자가 내용을 확인한 뒤 상담 일정을 안내해 드립니다.' }
  };
  const stage = document.getElementById('stage');
  const next = document.getElementById('next');
  const back = document.getElementById('back');
  const skip = document.getElementById('skip');
  const progress = document.querySelector('.progress');
  const progressFill = document.getElementById('progress-fill');
  let answers = { responses: {} };
  let current = 'type';
  let trail = [];
  let questionIndex = 0;
  let questions = [];
  let lookup = { status: 'idle', candidates: [] };
  let lookupRun = 0;
  let datasetPromise;
  let fullDatasetPromise;
  let addressLookupRun = 0;
  let submitting = false;
  let submitted = false;
  const companyId = '4206bdfd-b51d-4433-9f8e-c854131948cc';
  const params = new URLSearchParams(location.search);
  const eventKey = 'spacebogam.consultationApply.eventIds.v1';
  const attributionKeys = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'gclid', 'gbraid', 'wbraid', 'fbclid', 'msclkid', 'n_keyword', 'n_query', 'n_campaign_type', 'n_ad_group', 'n_keyword_id', 'utm_id', 'campaign_id', 'adset_id', 'ad_id', 'asset_id'];
  const id = () => crypto.randomUUID();
  function stored(store, key) { try { return store.getItem(key); } catch { return null; } }
  function savedId(store, key) {
    const value = stored(store, key);
    if (value) return value;
    const fresh = id();
    try { store.setItem(key, fresh); } catch {}
    return fresh;
  }
  const clientId = savedId(localStorage, 'spacebogam_funnel_client_id');
  const sessionId = savedId(sessionStorage, 'spacebogam_funnel_session_id');
  let eventIds;
  try { eventIds = JSON.parse(stored(sessionStorage, eventKey) || 'null'); } catch {}
  if (!eventIds?.lead_submit_success) {
    eventIds = { lead_form_view: id(), lead_form_start: id(), lead_submit_success: id() };
    try { sessionStorage.setItem(eventKey, JSON.stringify(eventIds)); } catch {}
  }
  let started = false;
  function trackingValue(key) {
    const direct = params.get(key);
    if (direct && !(key === 'utm_source' && direct === 'spacebogam.kr')) return direct;
    for (const source of ['spacebogam_funnel_first_touch_attribution', 'spacebogam_funnel_attribution']) {
      try {
        const saved = JSON.parse(localStorage.getItem(source) || 'null');
        if (saved?.expiresAt > Date.now() && saved.values?.[key]) return saved.values[key];
      } catch {}
    }
    return '';
  }
  function marketingAttribution() {
    let journey = {};
    try { journey = JSON.parse(sessionStorage.getItem('spacebogam_funnel_journey') || 'null') || {}; } catch {}
    const data = { form_path: location.pathname, source_page: location.pathname, landing_page: String(journey.landing_page || location.href).slice(0, 1000), referrer: String(journey.referrer || document.referrer || '').slice(0, 1000), submitted_at: new Date().toISOString(), device_type: innerWidth < 768 ? 'mobile' : innerWidth < 1024 ? 'tablet' : 'desktop', experiment_id: 'homepage_headline_v1', experiment_variant: stored(sessionStorage, 'spacebogam_homepage_headline_v1_variant') || '', page_variant: params.get('page_variant') || '', sbClientId: clientId, sbSessionId: sessionId, sbSubmitEventId: eventIds.lead_submit_success, is_test: /^(1|true|yes|y|on)$/i.test(params.get('is_test') || '') ? 'true' : '' };
    attributionKeys.forEach(key => { data[key] = trackingValue(key); });
    return data;
  }
  function funnel(name) {
    if (typeof fetch !== 'function') return;
    const data = { eventId: eventIds[name], clientId, sessionId, eventName: name, pagePath: location.pathname, pageTitle: document.title, occurredAt: new Date().toISOString(), experimentId: 'homepage_headline_v1', experimentVariant: stored(sessionStorage, 'spacebogam_homepage_headline_v1_variant') || '', ctaLocation: '', ctaText: '', pageVariant: params.get('page_variant') || '', deviceType: innerWidth < 768 ? 'mobile' : innerWidth < 1024 ? 'tablet' : 'desktop', isTest: /^(1|true|yes|y|on)$/i.test(params.get('is_test') || '') };
    ['utmSource', 'utmMedium', 'utmCampaign', 'utmContent', 'utmTerm'].forEach((field, index) => { data[field] = trackingValue(['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'][index]); });
    fetch('https://intm.kr/api/marketing/funnel-events', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data), keepalive: true }).catch(() => {});
  }
  const dongLists = window.SB_APT_DONGS || {};

  function effectiveQuestions(list) {
    const visible = list.filter(q => q && q.id != null && q.is_visible !== false && q.isVisible !== false)
      .map(q => ({ ...q, questionType: q.questionType || q.question_type,
        question: String(q.question || '').replace('통화 가능한 시간대', '연락 가능한 시간대') }));
    const replacements = { 11: 21, 59: 7, 24: 7, 28: 7, 20: 32, 19: 31 };
    const ids = new Set(visible.map(q => String(q.id)));
    const unique = visible.filter(q => !ids.has(String(replacements[q.id])));
    unique.forEach(q => {
      q.isRequired = q.questionType === 'short_answer' && /성함|이름/.test(q.question)
        || q.questionType === 'phonenumber' || /연락처/.test(q.question)
        || (q.questionType === 'address' || /주소/.test(q.question)) && !/세부/.test(q.question)
        || /평형|평수/.test(q.question);
      if (q.questionType === 'select' && /예산/.test(q.question)) q.options = ['4천만원 미만', '4천만~5천만원', '5천만~6천만원', '6천만~7천만원', '7천만~8천만원', '8천만~9천만원', '9천만~1억원', '1억~1.5억원', '1.5억~2억원', '2억원 이상'];
      if (q.questionType === 'multiple_choice' && /시공장소|공사 범위/.test(q.question)) {
        q.options = questionOptions(q).filter(option => !/확장|시스템에어컨|샤시|샷시|창호/.test(option));
      }
      if (/가족 구성/.test(q.question)) {
        q.questionType = 'household';
        q.options = questionOptions(q).filter(option => !/반려동물/.test(option));
      }
    });
    const required = unique.filter(q => q.isRequired);
    const detail = unique.filter(q => q.questionType === 'detailed_address');
    const optional = unique.filter(q => !q.isRequired && q.questionType !== 'detailed_address'
      && q.questionType !== 'password');
    const featured = [
      q => q.questionType === 'select' && /예산/.test(q.question),
      q => q.questionType === 'multiple_choice' && /시공장소|공사 범위/.test(q.question),
      q => q.questionType === 'multiple_choice' && /인테리어 스타일/.test(q.question),
      q => q.questionType === 'date' && /(시공|공사).*희망/.test(q.question),
      q => q.questionType === 'text' && /요청사항/.test(q.question)
    ].map(match => optional.find(match)).filter(Boolean);
    const ordered = [];
    required.forEach(q => { ordered.push(q); if (q.questionType === 'address') ordered.push(...detail); });
    const separate = [
      { id: 'expansion', question: '발코니 확장 계획이 있나요?', questionType: 'single_choice', options: ['네, 확장할 계획이에요', '확장하지 않아요', '아직 정하지 않았어요'], isRequired: false },
      { id: 'expansion_spaces', question: '어느 공간을 확장할 계획인가요? (복수 선택 가능)', questionType: 'multiple_choice', options: ['거실', '주방', '방'], isRequired: false, showIf: { id: 'expansion', value: '네, 확장할 계획이에요' } },
      { id: 'system_ac', question: '시스템에어컨을 설치할 계획인가요?', questionType: 'single_choice', options: ['네, 설치할 계획이에요', '설치하지 않아요', '아직 정하지 않았어요'], isRequired: false },
      { id: 'system_ac_count', question: '시스템에어컨은 몇 대 설치할 계획인가요?', questionType: 'number', options: [], isRequired: true, showIf: { id: 'system_ac', value: '네, 설치할 계획이에요' } },
      { id: 'sash', question: '샤시를 교체할 계획인가요?', questionType: 'single_choice', options: ['네, 교체할 계획이에요', '교체하지 않아요', '아직 정하지 않았어요'], isRequired: false }
    ];
    const remaining = optional.filter(q => !featured.includes(q));
    const day = remaining.find(q => q.questionType === 'multiple_choice' && /상담을 원하는 요일/.test(q.question));
    const date = remaining.find(q => q.questionType === 'date' && /상담을 원하는 날짜/.test(q.question));
    const time = remaining.find(q => q.questionType === 'single_choice' && /상담을 원하는 시간/.test(q.question));
    const callback = remaining.find(q => /연락 가능한 시간대/.test(q.question));
    const schedule = day && date && time ? { ...day, question: '상담 일정을 선택해 주세요.', questionType: 'schedule', parts: [day, date, time] } : null;
    const tail = schedule ? remaining.flatMap(q => q === day ? [schedule, ...(callback ? [callback] : [])]
      : q === date || q === time || q === callback ? [] : [q]) : remaining;
    return ordered.concat(featured.slice(0, 2), separate, featured.slice(2), tail);
  }

  function questionOptions(question) {
    if (Array.isArray(question.options)) return question.options;
    try { return JSON.parse(question.options || '[]'); } catch { return []; }
  }

  function loadQuestions() {
    if (typeof fetch !== 'function') return;
    fetch('https://intm.kr/api/consultation/questions').then(response => {
      if (!response.ok) throw new Error('questions unavailable');
      return response.json();
    }).then(body => {
      const loaded = effectiveQuestions(body.questions || []);
      if (loaded.length && current !== 'question' && current !== 'summary') {
        questions = loaded;
        const addressQuestion = questions.find(q => q.questionType === 'address');
        if (answers.apartmentSelected && addressQuestion) answers.responses[String(addressQuestion.id)] = answers.address;
        const areaQuestion = questions.find(q => /평형|평수/.test(q.question));
        if (answers.planAreaAuto && areaQuestion) answers.responses[String(areaQuestion.id)] = answers.planAreaValue;
      }
    }).catch(() => {});
  }

  function response(question) { return answers.responses[String(question.id)]; }
  function hasResponse(question) {
    const value = response(question);
    return Array.isArray(value) ? value.length > 0 : !!String(value || '').trim();
  }
  function isPastDate(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return false;
    const [year, month, day] = value.split('-').map(Number);
    const today = new Date();
    return new Date(year, month - 1, day) < new Date(today.getFullYear(), today.getMonth(), today.getDate());
  }
  function isApartment() { return answers.type === '주거 공간' && answers.housing === '아파트'; }
  function questionList() { return answers.type === '상업 공간' ? window.SB_CONSULTATION_QUESTIONS.commercial : questions; }
  function hiddenByBranch(question) {
    return question.showIf && !(question.showIf.values || [question.showIf.value]).includes(answers.responses[question.showIf.id]);
  }
  function skipQuestion(question) {
    return hiddenByBranch(question)
      || /연락 가능한 시간대/.test(question.question) && !!answers.responses['34']
      || String(question.id) === '38' && !!answers.responses['33']
      || isApartment() && answers.planDeferred && !answers.planStatus && /평형|평수/.test(question.question)
      || isApartment() && answers.address && question.questionType === 'address' && hasResponse(question)
      || isApartment() && answers.planAreaAuto && /평형|평수/.test(question.question) && hasResponse(question);
  }
  function nextQuestion(from) {
    const list = questionList();
    let index = from;
    while (index < list.length && skipQuestion(list[index])) index++;
    questionIndex = index;
    return index < list.length ? 'question' : 'consent';
  }

  function el(tag, className, value) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (value != null) node.textContent = value;
    return node;
  }

  function normalize(value) {
    return String(value || '').normalize('NFKC').toLowerCase()
      .replace(/부산(?:광역시|시)/g, '부산').replace(/[^\p{L}\p{N}]/gu, '');
  }

  function findCandidates(query, rows) {
    const key = normalize(query);
    if (key.length < 2) return [];
    const tokens = String(query).normalize('NFKC').replace(/부산(?:광역시|시)/g, '부산')
      .split(/[^\p{L}\p{N}]+/u).map(normalize).filter(token => token.length > 1);
    return rows.map(row => {
      const name = normalize(row[0]);
      const address = normalize(row[2]);
      let score = name === key ? 140 : name.includes(key) || address === key ? 110 : key.includes(name) && name.length > 3 ? 90 : address.includes(key) && key.length > 2 ? 80 : 0;
      if (!score) score = tokens.reduce((sum, token) => sum + (name.includes(token) ? 30 : address.includes(token) ? 12 : 0), 0);
      return { row, score };
    }).filter(item => item.score >= 30)
      .sort((a, b) => b.score - a.score || a.row[0].length - b.row[0].length)
      .slice(0, 8).map(item => item.row);
  }

  function loadDataset() {
    if (window.SB_APT_INDEX) return Promise.resolve(window.SB_APT_INDEX);
    if (datasetPromise) return datasetPromise;
    datasetPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = '/reports/consultation-step-prototype-20260928/apt-busan-index.js';
      script.onload = () => window.SB_APT_INDEX ? resolve(window.SB_APT_INDEX) : reject(new Error('empty index'));
      script.onerror = () => reject(new Error('index load failed'));
      document.head.appendChild(script);
    }).catch(error => { datasetPromise = null; throw error; });
    return datasetPromise;
  }

  function loadFullDataset() {
    if (fullDatasetPromise) return fullDatasetPromise;
    if (typeof fetch !== 'function') return Promise.reject(new Error('dataset unavailable'));
    fullDatasetPromise = fetch('/api/apartments/dataset')
      .then(response => { if (!response.ok) throw new Error('dataset unavailable'); return response.json(); })
      .then(body => {
        if (!Array.isArray(body.cols) || !Array.isArray(body.rows)) throw new Error('invalid dataset');
        const column = Object.fromEntries(body.cols.map((name, index) => [name, index]));
        return body.rows.map(item => [
          item[column.apartmentName], item[column.apartmentId],
          item[column.roadAddress] || item[column.legacyAddress], item[column.type],
          item[column.planPic], item[column.planId], item[column.legacyAddress]
        ]).filter(row => row[0] && row[1] && planUrl(row));
      }).catch(error => { fullDatasetPromise = null; throw error; });
    return fullDatasetPromise;
  }

  function findAddressCandidates(address, rows) {
    const key = normalize(address);
    if (key.length < 6 || !/\d/.test(key)) return [];
    const found = new Map();
    rows.forEach(row => {
      const matches = [row[2], row[6]].some(value => {
        const candidate = normalize(value);
        return candidate.length >= 8 && /\d/.test(candidate) && (candidate.includes(key) || key.includes(candidate));
      });
      if (matches && !found.has(row[1])) found.set(row[1], row);
    });
    return [...found.values()].slice(0, 8);
  }

  function startLookup(query) {
    const run = ++lookupRun;
    lookup = { status: 'loading', candidates: [] };
    const selected = answers.apartmentSelected;
    if (!selected || answers.apartmentUnmatched) {
      lookup = { status: 'ready', candidates: [], source: 'none' };
      return;
    }
    const fallback = () => {
      if (run !== lookupRun) return;
      lookup = { status: 'ready', candidates: planUrl(selected) ? [selected] : [], source: 'snapshot' };
      if (current === 'planReview') render();
    };
    if (!/^https?:$/.test(window.location?.protocol || '') || typeof fetch !== 'function') { fallback(); return; }
    fetch('/api/apartments/' + encodeURIComponent(selected[1]) + '/plans')
      .then(response => { if (!response.ok) throw new Error('plans unavailable'); return response.json(); })
      .then(body => {
        if (run !== lookupRun) return;
        const plans = Array.isArray(body.data) ? body.data : [];
        const candidates = plans.map(plan => [selected[0], selected[1], selected[2], plan.type, plan.planPic, plan.planId])
          .filter(row => planUrl(row));
        lookup = { status: 'ready', candidates, source: 'live' };
        if (current === 'planReview') render();
      }).catch(fallback);
  }

  function nextNode(key) {
    if (key === 'type') return answers.type === '주거 공간' ? 'housing' : nextQuestion(0);
    if (key === 'housing') return isApartment() ? 'apartmentQuery' : nextQuestion(0);
    if (key === 'apartmentQuery') return 'dong';
    if (key === 'dong') {
      if (lookup.status === 'loading') { answers.planDeferred = true; return nextQuestion(0); }
      return 'planReview';
    }
    if (key === 'planReview') {
      if (!answers.planDeferred) return nextQuestion(0);
      if (answers.planAreaAuto) return 'consent';
      const areaIndex = questionList().findIndex(question => /평형|평수/.test(question.question));
      if (areaIndex < 0) return 'consent';
      answers.planDeferredArea = true;
      questionIndex = areaIndex;
      return 'question';
    }
    if (key === 'question') {
      if (answers.planDeferredArea && /평형|평수/.test(questionList()[questionIndex].question)) return 'consent';
      const following = nextQuestion(questionIndex + 1);
      return following === 'consent' && answers.planDeferred && !answers.planStatus ? 'planReview' : following;
    }
    if (key === 'consent') return 'summary';
    return 'summary';
  }

  function clearError() {
    const box = stage.querySelector('.error');
    if (box) box.textContent = '';
    const input = stage.querySelector('.input-row input') || stage.querySelector('.question-input');
    if (input) input.removeAttribute('aria-invalid');
  }

  function showError(message) {
    const box = stage.querySelector('.error');
    if (box) box.textContent = message;
    const input = stage.querySelector('.input-row input') || stage.querySelector('.question-input');
    if (input) { input.setAttribute('aria-invalid', 'true'); input.focus(); }
  }

  function setChoice(key, value) {
    if (answers[key] !== value && key === 'type') {
      lookupRun++;
      lookup = { status: 'idle', candidates: [] };
      clearPlan();
      answers = { responses: {} };
    }
    if (answers[key] !== value && key === 'housing') {
      lookupRun++;
      lookup = { status: 'idle', candidates: [] };
      clearPlan();
      ['apartmentQuery', 'apartmentSelected', 'apartmentUnmatched', 'dong', 'dongManual', 'address', 'addressLookup'].forEach(item => delete answers[item]);
      answers.responses = {};
    }
    answers[key] = value;
    if (!started) { started = true; funnel('lead_form_start'); }
    advance();
  }

  function renderChoices(key) {
    const options = nodes[key].options;
    const group = el('div', 'choices');
    options.forEach((option, position) => {
      const button = el('button', 'choice');
      button.type = 'button';
      button.setAttribute('aria-pressed', answers[key] === option ? 'true' : 'false');
      button.appendChild(el('span', 'choice-key', String.fromCharCode(65 + position)));
      button.appendChild(el('span', null, option));
      button.appendChild(el('span', 'choice-arrow', '↗'));
      button.addEventListener('click', () => setChoice(key, option));
      group.appendChild(button);
    });
    stage.appendChild(group);
  }

  function renderApartmentSearch() {
    const node = nodes.apartmentQuery;
    const label = el('label', 'field');
    label.appendChild(el('span', 'field-label', node.label));
    const row = el('span', 'input-row');
    const input = el('input');
    input.type = 'search';
    input.value = answers.apartmentQuery || '';
    input.placeholder = node.placeholder;
    input.autocomplete = 'off';
    row.appendChild(input);
    label.appendChild(row);
    stage.appendChild(label);
    stage.appendChild(el('p', 'hint', node.hint));
    if (answers.apartmentSelected) stage.appendChild(el('p', 'selected-apartment', '선택한 단지 · ' + answers.apartmentSelected[0] + ' · ' + answers.apartmentSelected[2]));
    if (answers.apartmentUnmatched) stage.appendChild(el('p', 'selected-apartment', '검색 결과에 없는 단지 · 뒤에서 주소와 평형을 직접 입력합니다.'));
    const results = el('div', 'search-results');
    stage.appendChild(results);

    function showResults(query) {
      results.replaceChildren();
      if (normalize(query).length < 2) { results.appendChild(el('p', 'hint', '두 글자 이상 입력하면 단지 이름과 주소를 함께 검색합니다.')); return; }
      results.appendChild(el('p', 'hint', '아파트 목록을 검색하고 있어요.'));
      loadDataset().then(rows => {
        if (current !== 'apartmentQuery' || input.value !== query) return;
        results.replaceChildren();
        const matches = findCandidates(query, rows);
        results.appendChild(el('p', 'result-caption', matches.length ? '검색 결과 · 단지를 선택해 주세요' : '일치하는 단지가 없습니다.'));
        matches.forEach(match => {
          const button = el('button', 'search-result');
          button.type = 'button';
          button.appendChild(el('strong', null, match[0]));
          button.appendChild(el('small', null, match[2]));
          button.addEventListener('click', () => {
            if (answers.apartmentSelected?.[1] !== match[1]) {
              delete answers.dong; delete answers.dongManual;
              clearPlan();
            }
            answers.apartmentSelected = match;
            answers.apartmentUnmatched = false;
            answers.apartmentQuery = match[0];
            answers.address = match[2];
            const addressQuestion = questions.find(q => q.questionType === 'address');
            if (addressQuestion) answers.responses[String(addressQuestion.id)] = match[2];
            startLookup(match[0]);
            trail.push({ key: current, index: questionIndex });
            current = 'dong';
            render();
          });
          results.appendChild(button);
        });
        const manual = el('button', 'search-manual', '검색 결과에 없어요 · 직접 입력하기');
        manual.type = 'button';
        manual.addEventListener('click', () => {
          clearPlan();
          answers.apartmentSelected = null;
          answers.apartmentUnmatched = true;
          delete answers.address;
          const addressQuestion = questions.find(q => q.questionType === 'address');
          if (addressQuestion) delete answers.responses[String(addressQuestion.id)];
          advance();
        });
        results.appendChild(manual);
      }).catch(() => {
        if (current !== 'apartmentQuery' || input.value !== query) return;
        results.replaceChildren(el('p', 'hint', '검색 목록을 열지 못했습니다. 잠시 후 다시 시도해 주세요.'));
      });
    }

    input.addEventListener('input', () => {
      if (answers.apartmentQuery !== input.value) {
        lookupRun++;
        lookup = { status: 'idle', candidates: [] };
        clearPlan();
        ['apartmentSelected', 'apartmentUnmatched', 'dong', 'dongManual', 'planStatus', 'address', 'addressLookup'].forEach(item => delete answers[item]);
        const addressQuestion = questions.find(q => q.questionType === 'address');
        if (addressQuestion) delete answers.responses[String(addressQuestion.id)];
      }
      answers.apartmentQuery = input.value;
      clearError();
      next.disabled = true;
      showResults(input.value);
    });
    input.addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); advance(); } });
    showResults(input.value);
  }

  function renderDong() {
    const apartment = answers.apartmentSelected;
    const dongs = apartment ? dongLists[apartment[1]] : null;
    if (!dongs) {
      stage.appendChild(el('p', 'lookup-note', '이 단지의 확인된 동 목록이 없어 직접 입력할 수 있습니다.'));
      renderDongInput();
      return;
    }
    const label = el('label', 'field');
    label.appendChild(el('span', 'field-label', apartment[0] + ' · 동 선택'));
    const select = el('select', 'dong-select');
    const placeholder = el('option', null, '동을 선택해 주세요');
    placeholder.value = '';
    select.appendChild(placeholder);
    dongs.forEach(dong => { const option = el('option', null, dong); option.value = dong; select.appendChild(option); });
    const manual = el('option', null, '목록에 없어요 · 직접 입력');
    manual.value = '__manual__';
    select.appendChild(manual);
    select.value = answers.dongManual ? '__manual__' : answers.dong || '';
    select.addEventListener('change', () => {
      answers.dongManual = select.value === '__manual__';
      answers.dong = answers.dongManual ? '' : select.value;
      if (answers.dong) advance(); else render();
    });
    label.appendChild(select);
    stage.appendChild(label);
    if (answers.dongManual) renderDongInput();
    stage.appendChild(el('p', 'hint', '동 목록: 한국부동산원 2026.08.31 자료. 목록에 없으면 직접 입력하고, 도면은 마지막에 확인해 주세요.'));
  }

  function renderDongInput() {
    const node = nodes.dong;
    const label = el('label', 'field');
    label.appendChild(el('span', 'field-label', node.label));
    const row = el('span', 'input-row');
    const input = el('input');
    input.type = 'text';
    input.value = answers.dong || '';
    input.placeholder = node.placeholder;
    input.autocomplete = 'off';
    input.addEventListener('input', () => {
      answers.dong = input.value;
      clearError();
      next.disabled = !input.value.trim();
    });
    input.addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); advance(); } });
    row.appendChild(input);
    label.appendChild(row);
    stage.appendChild(label);
  }

  function planUrl(row) {
    if (/^fph\/[\w/-]+\.(?:jpe?g|webp)$/i.test(row[4])) return 'https://fphimage-cos.kujiale.com/' + row[4];
    if (/^https:\/\/fphimage-cos\.kujiale\.com\/fph\/[\w/-]+\.(?:jpe?g|webp)$/i.test(row[4])) return row[4];
    if (/^https:\/\/qhtbdoss\.kujiale\.com\/fpimgnew\/[\w/-]+\.jpe?g$/i.test(row[4])) return row[4];
    if (/^https:\/\/otondo-cdn\.s3\.ap-northeast-2\.amazonaws\.com\/media\/apartments-plans\/[\w-]+\.webp$/i.test(row[4])) return row[4];
    return '';
  }

  function clearPlan() {
    if (answers.planAttachment?.source === 'upload' && typeof URL !== 'undefined') URL.revokeObjectURL(answers.planAttachment.url);
    delete answers.planAttachment;
    delete answers.planStatus;
    if (answers.planAreaAuto) {
      const areaQuestion = questions.find(q => /평형|평수/.test(q.question));
      if (areaQuestion) delete answers.responses[String(areaQuestion.id)];
      delete answers.planAreaAuto;
      delete answers.planAreaValue;
      delete answers.planAreaSource;
    }
  }

  function openPlanPreview(item) {
    const dialog = el('dialog', 'plan-dialog');
    dialog.setAttribute('aria-label', '도면 크게 보기');
    const header = el('div', 'plan-dialog-header');
    header.appendChild(el('strong', null, item.name));
    const close = el('button', 'plan-close', '닫기 ×');
    close.type = 'button';
    close.addEventListener('click', () => dialog.close());
    header.appendChild(close);
    dialog.appendChild(header);
    const viewer = el('div', 'plan-viewer');
    const visual = el('img', 'plan-large');
    visual.src = item.url;
    visual.title = item.name + ' 크게 보기';
    visual.alt = item.name + ' 도면 크게 보기';
    viewer.appendChild(visual);
    dialog.appendChild(viewer);
    dialog.appendChild(el('p', 'plan-confirm-note', '상담할 공간의 도면이 맞는지 확인해 주세요. 목록 도면은 선택한 동이나 평형과 다를 수 있습니다.'));
    const controls = el('div', 'plan-controls');
    let flipX = item.flipX || false;
    let flipY = item.flipY || false;
    function applyFlip() { visual.style.transform = 'scale(' + (flipX ? -1 : 1) + ',' + (flipY ? -1 : 1) + ')'; }
    const horizontal = el('button', 'flip-button', '좌우 반전');
    horizontal.type = 'button';
    horizontal.setAttribute('aria-pressed', String(flipX));
    horizontal.addEventListener('click', () => { flipX = !flipX; horizontal.setAttribute('aria-pressed', String(flipX)); applyFlip(); });
    const vertical = el('button', 'flip-button', '상하 반전');
    vertical.type = 'button';
    vertical.setAttribute('aria-pressed', String(flipY));
    vertical.addEventListener('click', () => { flipY = !flipY; vertical.setAttribute('aria-pressed', String(flipY)); applyFlip(); });
    controls.appendChild(horizontal);
    controls.appendChild(vertical);
    const save = el('button', 'plan-save', '도면이 맞아요 · 저장하기');
    save.type = 'button';
    let saved = false;
    save.addEventListener('click', () => {
      if (answers.planAttachment?.url !== item.url) clearPlan();
      answers.planAttachment = { source: item.source, name: item.name, url: item.url, mime: item.mime, apartmentId: item.row?.[1] || null, planId: item.row?.[5] || null, file: item.file || null, flipX, flipY };
      answers.planStatus = 'saved';
      const squareMeters = Number(String(item.row?.[3] || '').match(/^\s*(\d+(?:\.\d+)?)[^㎡]*㎡/)?.[1]);
      const areaQuestion = questions.find(q => /평형|평수/.test(q.question));
      if (areaQuestion && squareMeters > 0) {
        answers.planAreaValue = String(Math.round(squareMeters / 3.305785 * 10) / 10);
        answers.planAreaSource = item.row[3];
        answers.planAreaAuto = true;
        answers.responses[String(areaQuestion.id)] = answers.planAreaValue;
      }
      saved = true;
      dialog.close();
      if (current === 'planReview') advance();
      else render();
    });
    controls.appendChild(save);
    dialog.appendChild(controls);
    dialog.addEventListener('close', () => {
      if (item.source === 'upload' && !saved && answers.planAttachment?.url !== item.url) URL.revokeObjectURL(item.url);
      dialog.remove();
    });
    stage.appendChild(dialog);
    applyFlip();
    dialog.showModal();
  }

  function renderAddressLookup() {
    const label = el('label', 'field');
    label.appendChild(el('span', 'field-label', '도로명주소 또는 지번주소로 도면 다시 찾기'));
    const row = el('span', 'input-row');
    const input = el('input', 'address-search');
    input.type = 'search';
    input.placeholder = '예: 부산 해운대구 마린시티3로 51';
    input.autocomplete = 'street-address';
    input.value = answers.addressLookup || answers.address || '';
    row.appendChild(input);
    label.appendChild(row);
    stage.appendChild(label);
    const results = el('div', 'search-results');
    stage.appendChild(results);

    function search() {
      const query = input.value.trim();
      answers.addressLookup = query;
      results.replaceChildren();
      if (normalize(query).length < 6 || !/\d/.test(normalize(query))) {
        results.appendChild(el('p', 'hint', '건물번호가 포함된 주소를 입력하면 apt.intm.kr 전체 도면 목록에서 다시 찾습니다.'));
        return;
      }
      answers.address = query;
      const addressQuestion = questions.find(question => question.questionType === 'address');
      if (addressQuestion) answers.responses[String(addressQuestion.id)] = query;
      const run = ++addressLookupRun;
      results.appendChild(el('p', 'hint', '주소로 도면을 다시 찾고 있어요.'));
      loadFullDataset().then(rows => {
        if (run !== addressLookupRun || current !== 'planReview' || input.value.trim() !== query) return;
        results.replaceChildren();
        const matches = findAddressCandidates(query, rows);
        results.appendChild(el('p', 'result-caption', matches.length
          ? '주소가 일치하는 단지 · 이름과 도면이 맞는지 선택해 주세요.'
          : '이 주소와 일치하는 도면이 없습니다. 직접 업로드하거나 도면 없이 진행해 주세요.'));
        matches.forEach(match => {
          const button = el('button', 'search-result');
          button.type = 'button';
          button.appendChild(el('strong', null, match[0]));
          button.appendChild(el('small', null, match[2] + ' · ' + match[3]));
          button.addEventListener('click', () => {
            const previousId = answers.apartmentSelected?.[1];
            clearPlan();
            answers.apartmentSelected = match;
            answers.apartmentUnmatched = false;
            answers.apartmentQuery = match[0];
            answers.address = query;
            if (addressQuestion) answers.responses[String(addressQuestion.id)] = query;
            lookup = { status: 'ready', candidates: rows.filter(candidate => candidate[1] === match[1]), source: 'address' };
            if (previousId !== match[1]) {
              delete answers.dong;
              delete answers.dongManual;
              trail.push({ key: current, index: questionIndex });
              current = 'dong';
            }
            render();
          });
          results.appendChild(button);
        });
      }).catch(() => {
        if (run !== addressLookupRun || current !== 'planReview' || input.value.trim() !== query) return;
        results.replaceChildren(el('p', 'hint', '주소 조회가 일시적으로 불가능합니다. 도면 직접 업로드 또는 도면 없이 진행할 수 있습니다.'));
      });
    }

    input.addEventListener('input', search);
    search();
  }

  function renderPlan() {
    const rows = lookup.status === 'ready' ? lookup.candidates.filter(row => planUrl(row)) : [];
    if (rows.length) {
      const list = el('div', 'plan-list');
      rows.forEach(row => {
        const button = el('button', 'plan-card');
        button.type = 'button';
        const image = el('img');
        image.src = planUrl(row);
        image.alt = row[0] + ' ' + row[3] + ' 평면도';
        image.addEventListener('error', () => {
          button.remove();
          if (!list.children.length && current === 'planReview') {
            lookup = { status: 'ready', candidates: [], source: lookup.source };
            render();
          }
        });
        button.appendChild(image);
        button.appendChild(el('span', null, row[0] + ' · ' + row[3]));
        button.appendChild(el('small', null, row[2] + ' · 도면 확인하기 / 크게 보기'));
        button.addEventListener('click', () => openPlanPreview({ source: 'catalog', row, name: row[0] + ' ' + row[3], url: planUrl(row), mime: 'image/jpeg', flipX: answers.planAttachment?.flipX, flipY: answers.planAttachment?.flipY }));
        list.appendChild(button);
      });
      stage.appendChild(list);
    } else {
      stage.appendChild(el('p', 'lookup-note', lookup.status === 'loading'
        ? '도면을 찾고 있어요. 기다리는 동안 직접 업로드할 수도 있습니다.'
        : '단지명으로 확인 가능한 도면이 없어 주소로 전체 도면 목록을 다시 조회합니다.'));
      if (lookup.status === 'ready') renderAddressLookup();
    }
    if (answers.planAttachment) stage.appendChild(el('p', 'selected-apartment', '상담 신청 데이터에 저장된 도면 · ' + answers.planAttachment.name + (answers.planAttachment.flipX ? ' · 좌우 반전' : '') + (answers.planAttachment.flipY ? ' · 상하 반전' : '') + (answers.planAreaAuto ? ' · 공급평형 약 ' + answers.planAreaValue + '평 자동 입력' : '')));
    const upload = el('input', 'plan-upload');
    upload.type = 'file';
    upload.accept = 'image/png,image/jpeg,image/webp';
    upload.hidden = true;
    upload.addEventListener('change', () => {
      const file = upload.files?.[0];
      if (!file) return;
      if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 15 * 1024 * 1024) {
        showError('JPG·PNG·WebP 이미지 파일을 15MB 이하로 선택해 주세요.');
        return;
      }
      const url = URL.createObjectURL(file);
      openPlanPreview({ source: 'upload', file, name: file.name, url, mime: file.type });
    });
    stage.appendChild(upload);
    const uploadButton = el('button', 'manual-option', '도면 직접 업로드하기 (이미지)');
    uploadButton.type = 'button';
    uploadButton.addEventListener('click', () => upload.click());
    stage.appendChild(uploadButton);
    const without = el('button', 'manual-option', '도면이 없어요 · 도면 없이 계속하기');
    without.type = 'button';
    without.addEventListener('click', () => { clearPlan(); answers.planStatus = 'none'; advance(); });
    stage.appendChild(without);
    stage.appendChild(el('p', 'plan-source', lookup.source === 'address'
      ? '자료: apt.intm.kr 전체 도면 목록. 주소가 같아도 평형·동이 다를 수 있으니 도면을 크게 보고 확인해 주세요.'
      : lookup.source === 'live'
      ? '자료: apt.intm.kr 공개 도면 목록. 같은 단지에도 여러 평형이 있습니다. 선택한 동·집의 도면이 맞는지 크게 보고 확인해 주세요.'
      : '자료: apt.intm.kr 공개 목록 · 2026.09.28 스냅샷. 현재는 단지별 대표 도면 1개만 표시됩니다. 실제 도면과 다르면 직접 업로드하거나 도면 없이 진행해 주세요.'));
  }

  function renderQuestion() {
    const question = questionList()[questionIndex];
    const key = String(question.id);
    const type = question.questionType;
    const options = questionOptions(question);
    if (type === 'schedule') {
      renderSchedule(question);
      return;
    }
    if (type === 'household') {
      const label = el('label', 'field');
      label.appendChild(el('span', 'field-label', '함께 사는 가족'));
      const select = el('select', 'question-input');
      const placeholder = el('option', null, '선택해 주세요');
      placeholder.value = '';
      select.appendChild(placeholder);
      options.forEach(option => { const item = el('option', null, option); item.value = option; select.appendChild(item); });
      select.value = response(question) || '';
      select.addEventListener('change', () => { answers.responses[key] = select.value; clearError(); });
      label.appendChild(select);
      stage.appendChild(label);
      const pet = el('label', 'pet-choice');
      const checkbox = el('input');
      checkbox.type = 'checkbox';
      checkbox.checked = !!answers.responses.pet;
      checkbox.addEventListener('change', () => { answers.responses.pet = checkbox.checked; clearError(); });
      pet.appendChild(checkbox);
      pet.appendChild(el('span', null, '반려동물과 함께 살아요'));
      stage.appendChild(pet);
      return;
    }
    if (['single_choice', 'multiple_choice'].includes(type)) {
      const group = el('div', 'choices');
      options.forEach((option, position) => {
        const button = el('button', 'choice');
        button.type = 'button';
        const selected = type === 'multiple_choice' ? (response(question) || []).includes(option) : response(question) === option;
        button.setAttribute('aria-pressed', String(selected));
        button.appendChild(el('span', 'choice-key', String.fromCharCode(65 + position)));
        button.appendChild(el('span', null, question.optionLabels?.[option] || option));
        button.addEventListener('click', () => {
          if (type === 'multiple_choice') {
            const values = Array.isArray(response(question)) ? [...response(question)] : [];
            answers.responses[key] = selected ? values.filter(value => value !== option)
              : ['전체 수리', 'none', 'unknown'].includes(option) ? [option]
                : values.filter(value => !['전체 수리', 'none', 'unknown'].includes(value)).concat(option);
            render();
          } else {
            answers.responses[key] = option;
            if (key === 'expansion' && option !== '네, 확장할 계획이에요') delete answers.responses.expansion_spaces;
            if (key === 'system_ac' && option !== '네, 설치할 계획이에요') delete answers.responses.system_ac_count;
            advance();
          }
        });
        group.appendChild(button);
      });
      stage.appendChild(group);
      return;
    }
    if (type === 'date') {
      renderDateCalendar(question);
      return;
    }
    const label = el('label', 'field');
    label.appendChild(el('span', 'field-label', question.question + (question.isRequired ? ' *' : ' · 선택 입력')));
    const input = el(type === 'text' ? 'textarea' : type === 'select' ? 'select' : 'input', 'question-input');
    if (type === 'select') {
      const placeholder = el('option', null, '선택해 주세요');
      placeholder.value = '';
      input.appendChild(placeholder);
      options.forEach(option => { const item = el('option', null, question.optionLabels?.[option] || option); item.value = option; input.appendChild(item); });
    } else if (type !== 'text') {
      input.type = { phonenumber: 'tel', number: 'number', date: 'date', password: 'password' }[type] || 'text';
      if (type === 'number') { input.min = '1'; if (question.id === 'system_ac_count') input.step = '1'; }
      if (type === 'phonenumber') { input.inputMode = 'tel'; input.autocomplete = 'tel'; input.placeholder = '010-0000-0000'; }
      if (type === 'detailed_address') input.placeholder = answers.dong ? answers.dong + ' · 호수 등' : '동·호수 등';
      if (type === 'address') input.placeholder = '현장 주소를 입력해 주세요';
    }
    input.value = response(question) || '';
    input.addEventListener(type === 'select' ? 'change' : 'input', () => {
      answers.responses[key] = input.value;
      clearError();
      next.disabled = !!question.isRequired && !input.value.trim();
      if (type === 'select' && input.value) advance();
    });
    input.addEventListener('keydown', event => { if (event.key === 'Enter' && type !== 'text') { event.preventDefault(); advance(); } });
    label.appendChild(input);
    stage.appendChild(label);
    if (type === 'address' && answers.apartmentUnmatched) stage.appendChild(el('p', 'hint', '검색 목록에 없는 아파트의 주소를 알려주세요. 도면이 없어도 상담은 진행할 수 있어요.'));
  }

  function renderSchedule(question) {
    const [day, date, time] = question.parts;
    const panel = el('div', 'schedule');
    const weekdays = el('section', 'schedule-section');
    weekdays.appendChild(el('h2', null, '가능한 요일'));
    weekdays.appendChild(el('p', 'schedule-hint', '여러 요일을 선택할 수 있어요. 날짜를 고르면 해당 요일도 포함해 주세요.'));
    const weekdayOptions = el('div', 'schedule-options');
    questionOptions(day).forEach(option => {
      const button = el('button', 'schedule-weekday', day.optionLabels?.[option] || option);
      button.type = 'button';
      button.setAttribute('aria-pressed', String((response(day) || []).includes(option)));
      button.addEventListener('click', () => {
        const values = Array.isArray(response(day)) ? response(day) : [];
        answers.responses[String(day.id)] = values.includes(option) ? values.filter(value => value !== option) : values.concat(option);
        button.setAttribute('aria-pressed', String(answers.responses[String(day.id)].includes(option)));
        clearError();
      });
      weekdayOptions.appendChild(button);
    });
    weekdays.appendChild(weekdayOptions);
    panel.appendChild(weekdays);
    const dateSection = el('section', 'schedule-section');
    dateSection.appendChild(el('h2', null, '원하는 날짜'));
    renderDateCalendar(date, dateSection, false);
    panel.appendChild(dateSection);
    const times = el('section', 'schedule-section');
    times.appendChild(el('h2', null, '원하는 시간'));
    const timeOptions = el('div', 'schedule-options');
    const timeButtons = [];
    questionOptions(time).forEach(option => {
      const button = el('button', 'schedule-time', time.optionLabels?.[option] || option);
      button.type = 'button';
      button.setAttribute('aria-pressed', String(response(time) === option));
      button.addEventListener('click', () => {
        answers.responses[String(time.id)] = option;
        timeButtons.forEach(item => item.button.setAttribute('aria-pressed', String(item.option === option)));
      });
      timeButtons.push({ button, option });
      timeOptions.appendChild(button);
    });
    times.appendChild(timeOptions);
    panel.appendChild(times);
    stage.appendChild(panel);
  }

  function renderDateCalendar(question, target = stage, moveAfterSelect = true) {
    const key = String(question.id);
    let selected = String(response(question) || '');
    const initial = /^\d{4}-\d{2}-\d{2}$/.test(selected) ? selected.split('-').map(Number) : null;
    const today = new Date();
    let shown = initial ? new Date(initial[0], initial[1] - 1, 1) : new Date(today.getFullYear(), today.getMonth(), 1);
    const calendar = el('div', 'calendar');
    calendar.setAttribute('role', 'group');
    calendar.setAttribute('aria-label', question.question);
    const header = el('div', 'calendar-header');
    const previous = el('button', 'calendar-nav', '←');
    previous.type = 'button';
    previous.setAttribute('aria-label', '이전 달');
    const month = el('strong', 'calendar-month');
    month.setAttribute('aria-live', 'polite');
    const following = el('button', 'calendar-nav', '→');
    following.type = 'button';
    following.setAttribute('aria-label', '다음 달');
    header.appendChild(previous);
    header.appendChild(month);
    header.appendChild(following);
    calendar.appendChild(header);
    const weekdays = el('div', 'calendar-weekdays');
    ['월', '화', '수', '목', '금', '토', '일'].forEach(day => weekdays.appendChild(el('span', null, day)));
    calendar.appendChild(weekdays);
    const grid = el('div', 'calendar-grid');
    calendar.appendChild(grid);
    function draw() {
      const year = shown.getFullYear();
      const monthIndex = shown.getMonth();
      month.textContent = year + '년 ' + (monthIndex + 1) + '월';
      grid.replaceChildren();
      const offset = (new Date(year, monthIndex, 1).getDay() + 6) % 7;
      for (let i = 0; i < offset; i++) grid.appendChild(el('span', 'calendar-empty'));
      const lastDay = new Date(year, monthIndex + 1, 0).getDate();
      for (let day = 1; day <= lastDay; day++) {
        const date = year + '-' + String(monthIndex + 1).padStart(2, '0') + '-' + String(day).padStart(2, '0');
        const isPast = new Date(year, monthIndex, day) < new Date(today.getFullYear(), today.getMonth(), today.getDate());
        const button = el('button', 'calendar-day', String(day));
        button.type = 'button';
        button.disabled = isPast;
        button.setAttribute('aria-label', year + '년 ' + (monthIndex + 1) + '월 ' + day + '일');
        button.setAttribute('aria-pressed', String(date === selected));
        if (year === today.getFullYear() && monthIndex === today.getMonth() && day === today.getDate()) button.setAttribute('aria-current', 'date');
        button.addEventListener('click', () => {
          if (isPast) return;
          answers.responses[key] = date;
          selected = date;
          clearError();
          if (moveAfterSelect) advance(); else draw();
        });
        grid.appendChild(button);
      }
    }
    previous.addEventListener('click', () => { shown = new Date(shown.getFullYear(), shown.getMonth() - 1, 1); draw(); });
    following.addEventListener('click', () => { shown = new Date(shown.getFullYear(), shown.getMonth() + 1, 1); draw(); });
    draw();
    target.appendChild(calendar);
  }

  function renderConsent() {
    const label = el('label', 'consent');
    const input = el('input');
    input.type = 'checkbox';
    input.checked = !!answers.consent;
    input.addEventListener('change', () => { answers.consent = input.checked; clearError(); next.disabled = !answers.consent; });
    label.appendChild(input);
    const copy = el('span');
    copy.appendChild(document.createTextNode('상담 진행을 위한 개인정보 수집·이용에 동의합니다. '));
    const link = el('a', null, '개인정보처리방침');
    link.href = '../../privacy/'; link.target = '_blank'; link.rel = 'noopener';
    copy.appendChild(link);
    label.appendChild(copy);
    stage.appendChild(label);
  }

  function renderSummary() {
    const list = el('dl', 'summary');
    const rows = [['공간', answers.type]];
    if (answers.type === '주거 공간') rows.push(['주거 유형', answers.housing]);
    if (isApartment()) rows.push(['아파트', answers.apartmentSelected?.[0] || answers.apartmentQuery], ['동', answers.dong]);
    if (isApartment()) rows.push(['도면', answers.planAttachment ? answers.planAttachment.name + ' · ' + (answers.planAttachment.source === 'upload' ? '직접 업로드' : '목록에서 저장') + (answers.planAttachment.flipX ? ' · 좌우 반전' : '') + (answers.planAttachment.flipY ? ' · 상하 반전' : '') : '없음 · 상담 시 확인']);
    questionList().flatMap(question => question.questionType === 'schedule' ? question.parts : [question]).forEach(question => {
      const value = response(question);
      if (!hiddenByBranch(question) && !(String(question.id) === '38' && answers.responses['33'])
        && !(/연락 가능한 시간대/.test(question.question) && answers.responses['34'])
        && hasResponse(question) && question.questionType !== 'password') {
        const label = item => question.optionLabels?.[item] || item;
        const display = Array.isArray(value) ? value.map(label).join(', ') : label(value) + (question.id === 'system_ac_count' ? '대' : question.id === 'area' || question.questionType === 'number' && /평형|평수/.test(question.question) ? '평' : '') + (answers.planAreaAuto && /평형|평수/.test(question.question) ? ' · 도면 표기 ' + answers.planAreaSource + ' (면적 종류 확인 필요)' : '');
        rows.push([question.question.replace(/(?:을|를) 알려주세요.*$/, ''), display]);
      }
      if (question.questionType === 'household' && answers.responses.pet) rows.push(['반려동물', '함께 살아요']);
    });
    rows.forEach(item => { const row = el('div'); row.appendChild(el('dt', null, item[0])); row.appendChild(el('dd', null, item[1] || '—')); list.appendChild(row); });
    stage.appendChild(list);
    const attachment = answers.planAttachment;
    if (attachment) {
      const button = el('button', 'summary-plan-button');
      button.type = 'button';
      button.setAttribute('aria-label', '저장된 도면 크게 보기');
      button.addEventListener('click', () => openPlanPreview({ ...attachment }));
      const image = el('img', 'summary-plan');
      image.src = attachment.url;
      image.alt = '저장된 도면';
      image.style.transform = 'scale(' + (attachment.flipX ? -1 : 1) + ',' + (attachment.flipY ? -1 : 1) + ')';
      button.appendChild(image);
      stage.appendChild(button);
    }
  }

  function submissionPayload(filePath) {
    const saved = Object.fromEntries(Object.entries(answers.responses)
      .filter(([key, value]) => /^\d+$/.test(key) && value !== '' && value != null)
      .map(([key, value]) => [key, Array.isArray(value) ? value.join(', ') : String(value)]));
    saved['9999'] = 'true';
    if (answers.type === '상업 공간') {
      const lead = Object.fromEntries(Object.entries(answers.responses).filter(([key]) => !/^\d+$/.test(key)));
      return { answers: { '9999': 'true' }, filePath: null, companyId, type: 'commercial', commercialLead: { ...lead, consent: true }, marketingAttribution: marketingAttribution() };
    }
    const details = [];
    if (answers.apartmentSelected) details.push('아파트: ' + answers.apartmentSelected[0] + ' / ' + (answers.dong || '동 미확인'));
    if (answers.apartmentUnmatched) details.push('검색 목록에 없는 아파트: ' + (answers.apartmentQuery || '미확인'));
    if (answers.planAttachment) details.push('도면: ' + (answers.planAttachment.source === 'catalog' ? 'apt.intm.kr 도면 ID ' + answers.planAttachment.planId : '직접 업로드') + ' / ' + answers.planAttachment.name + (answers.planAttachment.flipX ? ' / 좌우 반전' : '') + (answers.planAttachment.flipY ? ' / 상하 반전' : '') + (answers.planAreaSource ? ' / 면적 표기 ' + answers.planAreaSource : ''));
    else if (isApartment()) details.push('도면: 확인 가능한 도면 없음');
    [['발코니 확장', 'expansion'], ['확장 공간', 'expansion_spaces'], ['시스템에어컨', 'system_ac'], ['시스템에어컨 대수', 'system_ac_count'], ['샤시 교체', 'sash'], ['반려동물', 'pet']].forEach(([label, key]) => {
      const value = answers.responses[key];
      if (value) details.push(label + ': ' + (Array.isArray(value) ? value.join(', ') : value === true ? '있음' : value));
    });
    if (details.length) saved['7'] = [saved['7'], ...details].filter(Boolean).join('\n');
    return { answers: saved, filePath, companyId, type: 'residential', marketingAttribution: marketingAttribution() };
  }

  async function imageForSubmission(attachment) {
    let image = attachment.file;
    if (attachment.source === 'catalog') {
      const response = await fetch('/api/consultation/plan-image?url=' + encodeURIComponent(attachment.url));
      if (!response.ok) throw new Error('선택한 도면 이미지를 가져오지 못했습니다. 다시 시도하거나 직접 업로드해 주세요.');
      image = await response.blob();
    }
    if (!image || !['image/png', 'image/jpeg', 'image/webp'].includes(image.type) || image.size > 15 * 1024 * 1024) {
      throw new Error('도면 이미지를 확인할 수 없습니다. JPG·PNG·WebP 이미지를 다시 선택해 주세요.');
    }
    if (!attachment.flipX && !attachment.flipY) return image;
    const bitmap = await createImageBitmap(image);
    try {
      const canvas = document.createElement('canvas');
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('도면 이미지 방향을 저장하지 못했습니다. 다시 시도해 주세요.');
      context.fillStyle = '#fff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.translate(attachment.flipX ? canvas.width : 0, attachment.flipY ? canvas.height : 0);
      context.scale(attachment.flipX ? -1 : 1, attachment.flipY ? -1 : 1);
      context.drawImage(bitmap, 0, 0);
      const transformed = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.94));
      if (!transformed || transformed.size > 15 * 1024 * 1024) throw new Error('도면 이미지를 저장하지 못했습니다. 작은 이미지를 선택해 주세요.');
      return transformed;
    } finally { bitmap.close(); }
  }

  async function submitConsultation() {
    if (submitting || submitted) return;
    submitting = true;
    next.disabled = true;
    next.textContent = '접수 중…';
    clearError();
    try {
      let filePath = null;
      if (answers.planAttachment) {
        if (!answers.planAttachment.filePath) {
          const body = new FormData();
          const image = await imageForSubmission(answers.planAttachment);
          const name = answers.planAttachment.name.replace(/\.[^.]+$/, '') + (image.type === 'image/jpeg' ? '.jpg' : image.type === 'image/png' ? '.png' : '.webp');
          body.append('file', image, name);
          const uploaded = await fetch('/api/consultation/upload', { method: 'POST', body });
          const result = await uploaded.json();
          if (!uploaded.ok || !result.success || !result.filePath) throw new Error('도면 업로드에 실패했습니다. 다시 시도해 주세요.');
          answers.planAttachment.filePath = result.filePath;
        }
        filePath = answers.planAttachment.filePath;
      }
      const response = await fetch('https://intm.kr/api/consultation/submit', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(submissionPayload(filePath))
      });
      const result = await response.json();
      if (!response.ok || result.success !== true) throw new Error(result.error || '접수에 실패했습니다.');
      submitted = true;
      answers.receiptId = result.consultReqId;
      try { if (typeof fbq === 'function') fbq('track', 'Lead', { currency: 'KRW' }, { eventID: result.leadEventId || eventIds.lead_submit_success }); } catch {}
      try { if (typeof gtag === 'function') gtag('event', 'lead_submit_success', { event_category: 'lead', lead_event_id: result.leadEventId || eventIds.lead_submit_success }); } catch {}
      funnel('lead_submit_success');
      try { sessionStorage.removeItem(eventKey); } catch {}
      current = 'success';
      render();
    } catch (error) {
      showError(error.message || '접수에 실패했습니다. 잠시 후 다시 시도해 주세요.');
      next.disabled = false;
      next.textContent = '다시 접수하기 →';
    } finally { submitting = false; }
  }

  function render() {
    stage.replaceChildren();
    const question = current === 'question' ? questionList()[questionIndex] : null;
    const node = question ? { title: question.question, lead: question.questionType === 'schedule' ? '가능한 요일과 원하는 날짜·시간을 한 화면에서 선택해 주세요. 아직 정하지 않았다면 건너뛰어도 됩니다.' : question.isRequired ? '상담에 필요한 정보입니다.' : '선택 입력입니다. 아직 정하지 않았다면 건너뛰어도 됩니다.' } : nodes[current];
    stage.appendChild(el('p', 'step-meta', current === 'summary' ? '입력 내용 확인' : current === 'success' ? '접수 완료' : '질문 ' + String(trail.length + 1).padStart(2, '0')));
    stage.appendChild(el('h1', null, node.title));
    stage.appendChild(el('p', 'lead', node.lead));
    if (['type', 'housing'].includes(current)) renderChoices(current);
    else if (current === 'apartmentQuery') renderApartmentSearch();
    else if (current === 'dong') renderDong();
    else if (current === 'planReview') renderPlan();
    else if (current === 'question') renderQuestion();
    else if (current === 'consent') renderConsent();
    else if (current === 'summary') renderSummary();
    else if (current === 'success') stage.appendChild(el('p', 'selected-apartment', '접수번호 · ' + (answers.receiptId || '발급 완료')));
    if (current !== 'success') stage.appendChild(el('p', 'error'));
    back.hidden = trail.length === 0 || current === 'success';
    skip.hidden = current !== 'question' || question.isRequired;
    next.hidden = current === 'success';
    next.textContent = current === 'summary' ? '상담 신청하기 →' : current === 'consent' ? '입력 내용 확인 →' : '다음 →';
    next.disabled = current === 'summary' ? false
      : current === 'planReview' ? !['saved', 'none'].includes(answers.planStatus)
        : current === 'apartmentQuery' ? !answers.apartmentSelected && !answers.apartmentUnmatched
          : current === 'question' ? question.isRequired && !hasResponse(question)
            : current === 'consent' ? !answers.consent
              : !String(answers[current] || '').trim();
    const total = questionList().filter(q => !skipQuestion(q)).length + (isApartment() ? 5 : answers.type === '주거 공간' ? 2 : 1) + 1;
    const percent = current === 'summary' || current === 'success' ? 100 : Math.min(95, Math.round(trail.length / total * 100));
    progress.setAttribute('aria-valuenow', String(percent));
    progressFill.style.width = percent + '%';
  }

  function advance() {
    if (current === 'summary') { submitConsultation(); return; }
    if (current === 'success') return;
    if (current === 'question') {
      const question = questionList()[questionIndex];
      const value = response(question);
      if (question.isRequired && !hasResponse(question)) { showError('이 항목을 입력해 주세요.'); return; }
      if (question.questionType === 'date' && isPastDate(value)) { showError('오늘 이후의 날짜를 선택해 주세요.'); return; }
      if (question.questionType === 'schedule') {
        const [day, date] = question.parts;
        const selectedDate = response(date);
        const weekdays = response(day);
        if (isPastDate(selectedDate)) { showError('오늘 이후의 날짜를 선택해 주세요.'); return; }
        if (selectedDate && Array.isArray(weekdays) && weekdays.length) {
          const [year, month, dayOfMonth] = selectedDate.split('-').map(Number);
          const actualDay = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일'][new Date(year, month - 1, dayOfMonth).getDay()];
          if (!weekdays.includes(actualDay)) { showError('선택한 날짜는 ' + actualDay + '이에요. 가능한 요일에 추가하거나 날짜를 바꿔 주세요.'); return; }
        }
      }
      if (question.questionType === 'phonenumber' && !/^01\d-?\d{3,4}-?\d{4}$/.test(String(value).replace(/\s/g, ''))) { showError('연락 가능한 휴대전화 번호를 입력해 주세요.'); return; }
      if (question.id === 'requestNote' && String(value || '').trim().length < 10) { showError('원하는 공간과 요청사항을 10자 이상 입력해 주세요.'); return; }
      if (question.questionType === 'number' && question.isRequired && (question.id === 'system_ac_count' ? !/^[1-9]\d*$/.test(String(value)) : !/^\d+(?:\.\d+)?$/.test(String(value)) || Number(value) <= 0)) { showError(question.id === 'system_ac_count' ? '설치 대수를 1 이상의 정수로 입력해 주세요.' : '0보다 큰 평형을 입력해 주세요.'); return; }
      if (question.questionType === 'address') answers.address = value;
    } else if (current === 'planReview') {
      if (!['saved', 'none'].includes(answers.planStatus)) { showError('도면을 저장하거나 도면 없이 진행을 선택해 주세요.'); return; }
    } else if (current === 'consent') {
      if (!answers.consent) { showError('개인정보 수집·이용 동의가 필요합니다.'); return; }
    } else {
      const value = String(answers[current] || '').trim();
      if (!value) { showError('이 항목을 입력해 주세요.'); return; }
      if (current === 'apartmentQuery' && normalize(value).length < 2) { showError('아파트 이름이나 주소를 두 글자 이상 입력해 주세요.'); return; }
      if (current === 'apartmentQuery' && !answers.apartmentSelected && !answers.apartmentUnmatched) { showError('검색 결과에서 아파트를 선택해 주세요.'); return; }
      if (current === 'apartmentQuery') startLookup(value);
    }
    trail.push({ key: current, index: questionIndex });
    current = nextNode(current);
    render();
  }

  next.addEventListener('click', advance);
  back.addEventListener('click', () => { if (trail.length) { const previous = trail.pop(); current = previous.key; questionIndex = previous.index; render(); } });
  skip.addEventListener('click', () => {
    if (current !== 'question' || questionList()[questionIndex].isRequired) return;
    const key = String(questionList()[questionIndex].id);
    delete answers.responses[key];
    if (questionList()[questionIndex].questionType === 'schedule') {
      questionList()[questionIndex].parts.forEach(part => delete answers.responses[String(part.id)]);
    }
    if (questionList()[questionIndex].questionType === 'household') delete answers.responses.pet;
    if (key === 'expansion') delete answers.responses.expansion_spaces;
    if (key === 'system_ac') delete answers.responses.system_ac_count;
    advance();
  });
  document.getElementById('restart').addEventListener('click', () => {
    lookupRun++;
    clearPlan();
    answers = { responses: {} };
    submitted = false;
    started = false;
    eventIds = { lead_form_view: id(), lead_form_start: id(), lead_submit_success: id() };
    try { sessionStorage.setItem(eventKey, JSON.stringify(eventIds)); } catch {}
    lookup = { status: 'idle', candidates: [] };
    trail = [];
    questionIndex = 0;
    current = 'type';
    funnel('lead_form_view');
    render();
  });
  questions = effectiveQuestions(window.SB_CONSULTATION_QUESTIONS.residential);
  loadQuestions();
  if (typeof fetch === 'function') funnel('lead_form_view');
  render();
})();
