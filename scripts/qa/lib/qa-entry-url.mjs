// CMP-267: QA 프로브 유입 URL 공용 빌더.
//
// 배경: 검증 세션 표식(is_test)은 assets/funnel-tracking.js 의 resolveTestSession 이
// **유입 URL 의 is_test 파라미터**를 볼 때만 켜진다. 표식을 켜는 코드는 CMP-191/CMP-225 로
// 배포됐지만 scripts/qa/ 의 프로브들은 utm_source=qa_* 만 붙이고 is_test 를 안 붙였다.
// 그래서 라이브에서 프로브를 돌릴 때마다 그 세션이 실유입으로 집계됐다(2026-07-29 기준 138건/28세션).
//
// 규약: 라이브 오리진(spacebogam.kr)으로 나가는 QA 진입 URL 은 이 모듈로만 만든다.
// qaEntryUrl() 은 is_test=1 을 항상 강제하므로 개별 스크립트가 잊어버릴 수 없다.

export const LIVE_HOSTS = ['spacebogam.kr', 'www.spacebogam.kr'];

// assets/funnel-tracking.js 의 TEST_TRUTHY, consultation-form.js 의 TEST_TRUTHY 와 같은 목록이어야 한다.
export const TEST_TRUTHY = ['1', 'true', 'yes', 'y', 'on'];

export function isLiveOrigin(url) {
  try {
    return LIVE_HOSTS.includes(new URL(url, 'https://spacebogam.kr').hostname);
  } catch {
    return false;
  }
}

export function hasTestFlag(url) {
  try {
    const raw = String(new URL(url, 'https://spacebogam.kr').searchParams.get('is_test') || '')
      .trim()
      .toLowerCase();
    return TEST_TRUTHY.includes(raw);
  } catch {
    return false;
  }
}

/**
 * QA 진입 URL 을 만든다. 라이브 오리진이면 is_test=1 을 무조건 붙인다.
 *
 * @param {string} base   예: 'https://spacebogam.kr/' 또는 'https://spacebogam.kr/consultation/'
 * @param {object|string|URLSearchParams} params  쿼리 파라미터 (utm_* 등)
 * @returns {string}
 */
export function qaEntryUrl(base, params = {}) {
  const url = new URL(base, 'https://spacebogam.kr');
  const extra = params instanceof URLSearchParams ? params : new URLSearchParams(params);
  for (const [k, v] of extra) {
    if (v === undefined || v === null || v === '') continue;
    url.searchParams.set(k, String(v));
  }
  // 프리뷰(127.0.0.1:3023)에서도 표식을 켜 두면 수집 경로가 라이브와 동일해져 판정이 흔들리지 않는다.
  url.searchParams.set('is_test', '1');
  return url.toString();
}

/**
 * 이미 만들어진 URL 이 규약을 지키는지 확인한다. 어기면 던진다.
 * 라이브로 나가기 직전 호출해서 "붙였다고 생각했는데 안 붙은" 경우를 실행 시점에 잡는다.
 */
export function assertQaEntryUrl(url, label = 'QA entry URL') {
  if (isLiveOrigin(url) && !hasTestFlag(url)) {
    throw new Error(
      `[CMP-267] ${label} 이 라이브 오리진인데 is_test 표식이 없습니다: ${url}\n` +
        '  scripts/qa/lib/qa-entry-url.mjs 의 qaEntryUrl() 로 만드십시오.',
    );
  }
  return url;
}
