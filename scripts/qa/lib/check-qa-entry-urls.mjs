#!/usr/bin/env node
// CMP-267 재발 방지 장치: scripts/qa/ 안에서 라이브 오리진(spacebogam.kr)으로 향하는
// 유입 URL 이 검증 세션 표식(is_test) 없이 남아 있으면 비정상 종료한다.
//
// 왜 필요한가: 표식은 유입 URL 의 is_test 파라미터로만 켜진다(assets/funnel-tracking.js
// resolveTestSession). 프로브가 이를 빠뜨리면 QA 세션이 그대로 실유입으로 집계되는데,
// 스크립트만 봐서는 표식이 켜져 있다고 착각하기 쉽다. 사람이 눈으로 확인하는 대신 여기서 막는다.
//
// 사용: node scripts/qa/lib/check-qa-entry-urls.mjs
// 종료 코드: 0 = 위반 없음, 1 = 위반 있음
//
// 예외가 필요하면 해당 줄이나 그 근처(±3줄)에 `qa-entry-url-allow: <사유>` 주석을 남긴다.
// 파일 전체를 면제하려면 `qa-entry-url-allow-file: <사유>` 를 파일 어디든 한 번 남긴다.

import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const QA_DIR = dirname(dirname(fileURLToPath(import.meta.url)));
const REPO = dirname(dirname(QA_DIR));

const LIVE_URL = /(?:https?:\/\/)?(?:www\.)?spacebogam\.kr/;
const SCANNED_EXT = /\.(mjs|cjs|js|sh|bash)$/;
const ALLOW = /qa-entry-url-allow:/;
const ALLOW_FILE = /qa-entry-url-allow-file:/;
// 표식이 이 근처에 있으면 통과로 본다. qaEntryUrl() 은 is_test 를 강제하므로 동치로 취급한다.
const SATISFIED = /\bis_test\b|\bisTest\b|qaEntryUrl|assertQaEntryUrl/;
// URL 은 상수로 선언하고 쿼리는 몇 줄 아래에서 붙이는 스크립트가 있어 앞뒤로 창을 둔다.
const WINDOW = 3;

function listFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    // lib/ 는 빌더·검사기 자신이라 URL 문자열이 정의상 들어간다.
    if (entry.isDirectory()) {
      if (entry.name !== 'lib') out.push(...listFiles(full));
    }
    else if (SCANNED_EXT.test(entry.name)) out.push(full);
  }
  return out;
}

const violations = [];
for (const file of listFiles(QA_DIR).sort()) {
  const source = readFileSync(file, 'utf8');
  if (ALLOW_FILE.test(source)) continue;
  const lines = source.split('\n');
  lines.forEach((line, i) => {
    if (!LIVE_URL.test(line)) return;
    // 주석에 적힌 URL 은 유입이 아니다.
    const code = line.replace(/^\s*(\/\/|#)\s?.*$/, '');
    if (!LIVE_URL.test(code)) return;
    const window = lines.slice(Math.max(0, i - WINDOW), i + WINDOW + 1).join('\n');
    if (SATISFIED.test(window) || ALLOW.test(window)) return;
    violations.push({ file: relative(REPO, file), line: i + 1, text: line.trim().slice(0, 140) });
  });
}

if (violations.length === 0) {
  console.log('[CMP-267] OK — scripts/qa/ 의 라이브 유입 URL 이 모두 is_test 표식을 지니고 있습니다.');
  process.exit(0);
}

console.error(`[CMP-267] 위반 ${violations.length}건 — 라이브 유입 URL 에 is_test 표식이 없습니다.\n`);
for (const v of violations) {
  console.error(`  ${v.file}:${v.line}`);
  console.error(`    ${v.text}`);
}
console.error('\n고치는 법: scripts/qa/lib/qa-entry-url.mjs 의 qaEntryUrl() 로 URL 을 만드십시오.');
console.error('의도된 예외라면 해당 줄에 `qa-entry-url-allow: <사유>` 주석을 남기십시오.');
process.exit(1);
