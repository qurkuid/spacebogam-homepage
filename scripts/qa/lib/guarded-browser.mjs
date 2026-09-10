// CMP-1341: 네트워크 계층 fail-closed 가드.
//
// 배경: is_test=1 을 유입 URL 에 붙이는 건 "규약"이지 강제가 아니다. CMP-267 로
// scripts/qa/** 안에서는 check-qa-entry-urls.mjs 가 정적으로 잡지만, scripts/qa/ 밖
// (런 스크래치, .omx/ 같은 워크스페이스 디렉터리)에 만든 일회성 헤드리스 스크립트는
// 검사기 사각지대다 — CMP-1312 R1(2026-07-29)에 이어 R3(2026-08-23)에도 같은 경로로
// 재발했다(.omx/cmp1312-live-routing-qa.js, .omx/cmp1312-shop-proof.js). "URL 만들 때
// 잊지 말자"는 규약은 이미 두 번 실패했으므로, URL 을 어떻게 만들었는지와 무관하게
// 실제 네트워크 전송 시점에 막는 계층이 필요하다.
//
// 이 모듈은 라이브 상담퍼널 수집 엔드포인트(intm.kr/api/marketing/funnel-events)로
// 나가는 요청을 가로채, 페이로드의 isTest 가 true 가 아니면 요청 자체를 중단시킨다.
// puppeteer/playwright page 어디서든 네비게이션 직전에 guardLiveFunnelSending(page) 를
// 한 번 호출하면 된다 — 그 뒤로는 스크립트가 is_test 를 URL 에 붙였는지 여부와 무관하게
// 동작한다(붙였으면 통과, 안 붙였으면 차단).

export const FUNNEL_ENDPOINT_HOST = 'intm.kr';
export const FUNNEL_ENDPOINT_PATH = '/api/marketing/funnel-events';

function isFunnelBeacon(url) {
  return url.hostname === FUNNEL_ENDPOINT_HOST && url.pathname === FUNNEL_ENDPOINT_PATH;
}

function payloadIsTest(postData) {
  try {
    return JSON.parse(postData || '{}').isTest === true;
  } catch {
    return false;
  }
}

/**
 * 라이브 퍼널 수집 엔드포인트로 나가는 요청 중 isTest !== true 인 것을 전부 막는다.
 * puppeteer(-core) Page 인터페이스 기준(request interception API). page.goto() 등
 * 네비게이션을 호출하기 **전에** 불러야 한다.
 *
 * @param {import('puppeteer-core').Page} page
 * @returns {Array<{url: string, body: string}>} blocked — 차단된 요청 기록(로그·검증용).
 *   배열이 비어 있다고 "안전"한 게 아니다 — is_test 가 정상 전파돼 애초에 차단할 대상이
 *   없었을 수도 있다. 반대로 이 배열에 항목이 쌓이면 그게 바로 이 가드가 막아낸 오염이다.
 */
export async function guardLiveFunnelSending(page) {
  const blocked = [];
  await page.setRequestInterception(true);
  page.on('request', (request) => {
    let target;
    try {
      target = new URL(request.url());
    } catch {
      return request.continue();
    }
    if (!isFunnelBeacon(target)) return request.continue();
    // CORS preflight(OPTIONS)는 스펙상 바디가 없다 — isTest 를 담을 수 없는 요청이라
    // 여기서 막으면 실제 POST 가 CORS 실패로 아예 발사되지 않는다(음성/양성 테스트 둘 다
    // 막아버리는 오탐이었다). preflight 는 통과시키고 실제 전송(POST)만 판정한다.
    if (request.method() === 'OPTIONS') return request.continue();
    const postData = request.postData();
    if (payloadIsTest(postData)) return request.continue();
    blocked.push({ url: request.url(), body: postData || '' });
    return request.abort('blockedbyclient');
  });
  return blocked;
}
