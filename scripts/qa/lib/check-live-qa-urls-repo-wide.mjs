#!/usr/bin/env node
// CMP-1341 재발 방지 장치: check-qa-entry-urls.mjs(CMP-267)는 scripts/qa/** 만 본다.
// 실제 오염은 그 밖 — 워크스페이스 스크래치 디렉터리(.omx/ 등)에 만든 일회성 헤드리스
// 스크립트에서 두 번(CMP-1312 R1, R3) 일어났다. 이 스캐너는 저장소 전체(추적 여부
// 무관, node_modules/.git/미디어 제외)를 훑어 같은 패턴을 잡는다.
//
// 사용: node scripts/qa/lib/check-live-qa-urls-repo-wide.mjs
// 종료 코드: 0 = 위반 없음, 1 = 위반 있음
//
// 예외: 해당 줄이나 그 근처(±3줄)에 `qa-entry-url-allow: <사유>` 주석,
// 파일 전체 면제는 `qa-entry-url-allow-file: <사유>`.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = dirname(dirname(dirname(dirname(fileURLToPath(import.meta.url)))));

const LIVE_URL = /(?:https?:\/\/)?(?:www\.)?spacebogam\.kr/;
const SCANNED_EXT = /\.(mjs|cjs|js|ts|sh|bash|py)$/;
const ALLOW = /qa-entry-url-allow:/;
const ALLOW_FILE = /qa-entry-url-allow-file:/;
const SATISFIED = /\bis_test\b|\bisTest\b|qaEntryUrl|assertQaEntryUrl|guardLiveFunnelSending/;
const WINDOW = 3;
// 순수 문자열 상수(프로덕션 코드·유닛테스트 목·카드뉴스 문구)는 판정 대상이 아니다.
// 이 스캐너가 잡아야 하는 건 실제로 브라우저 자바스크립트를 실행시켜 funnel-tracking.js
// 의 send() 가 발화할 수 있는 코드 — 헤드리스 브라우저 자동화 — 뿐이다. 순수 GET
// (urlopen 등, JS 미실행)은 애초에 비콘을 못 쏘므로 대상이 아니다. 이 신호가 파일 어디에도
// 없으면 파일 전체를 건너뛴다(라인 단위가 아니라 파일 단위로 게이트한다, launch 호출과
// URL 리터럴이 같은 파일의 먼 줄에 떨어진 경우가 많아서다).
//
// 알려진 한계: 수집 엔드포인트(funnel-events)를 curl/requests 로 직접 두드리는 프로브는
// 이 마커에 안 걸린다. production 코드(assets/*.js)와 유닛테스트(tests/*.test.js)가
// 전부 "funnel-events" 문자열을 정당하게 포함하고 있어 그것만으로 파일 전체를 게이트하면
// 노이즈가 신호를 덮는다 — 실측 결과 확정 위반 3건 대비 오탐 16건. 그런 프로브는
// scripts/qa/**(check-qa-entry-urls.mjs 가 봄) 또는 tests/*_contract_check.py 관례
// (utm_source=qa 마킹, [[qa-lead-exclusion-definition-mismatch]] 참고)로 커버한다.
const AUTOMATION_MARKER = /puppeteer|playwright|selenium|webdriver|chromium\.launch|\.newPage\(/i;

// 이 디렉터리들은 통째로 건너뛴다: 의존성, VCS 내부, 정적 산출물/미디어, scripts/qa 는
// 이미 check-qa-entry-urls.mjs 가 더 엄격히(lib 제외 없이) 보고 있어 중복 스캔하지 않는다.
const SKIP_DIRS = new Set([
  'node_modules', '.git', 'artifacts', 'reports',
  '.omc', // 에이전트 프레임워크 자체 로그 — 코드가 아니다
]);

function listFiles(dir) {
  const out = [];
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (entry.name.startsWith('.') && entry.name !== '.omx') continue; // .git 등 숨김은 건너뛰되 .omx 는 명시 허용
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...listFiles(full));
    } else if (SCANNED_EXT.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

const violations = [];
for (const file of listFiles(REPO).sort()) {
  let source;
  try {
    source = readFileSync(file, 'utf8');
  } catch {
    continue;
  }
  if (ALLOW_FILE.test(source)) continue;
  if (!AUTOMATION_MARKER.test(source)) continue;
  const lines = source.split('\n');
  lines.forEach((line, i) => {
    if (!LIVE_URL.test(line)) return;
    const code = line.replace(/^\s*(\/\/|#)\s?.*$/, '');
    if (!LIVE_URL.test(code)) return;
    const window = lines.slice(Math.max(0, i - WINDOW), i + WINDOW + 1).join('\n');
    if (SATISFIED.test(window) || ALLOW.test(window)) return;
    violations.push({ file: relative(REPO, file), line: i + 1, text: line.trim().slice(0, 140) });
  });
}

if (violations.length === 0) {
  console.log('[CMP-1341] OK — 저장소 전체에서 is_test 표식 없는 라이브 유입 URL 이 없습니다.');
  process.exit(0);
}

console.error(`[CMP-1341] 위반 ${violations.length}건 — 라이브 유입 URL 에 is_test 표식이 없습니다.\n`);
for (const v of violations) {
  console.error(`  ${v.file}:${v.line}`);
  console.error(`    ${v.text}`);
}
console.error('\n고치는 법: scripts/qa/lib/qa-entry-url.mjs 의 qaEntryUrl() 로 URL 을 만들거나,');
console.error('scripts/qa/lib/guarded-browser.mjs 의 guardLiveFunnelSending(page) 로 전송 자체를 막으십시오.');
console.error('의도된 예외라면 해당 줄에 `qa-entry-url-allow: <사유>` 주석을 남기십시오.');
process.exit(1);
