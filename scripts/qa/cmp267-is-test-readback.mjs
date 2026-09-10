#!/usr/bin/env node
// CMP-267 read-back: 프로브가 남긴 세션의 spacebogam_funnel_events 행이 실제로
// is_test = true 로 저장됐는지 **저장값으로** 판정한다.
// "URL 에 파라미터를 붙였다"는 증거로 인정되지 않는다 — 그래서 이 스크립트가 있다.
//
// 사용:
//   DATABASE_URL='postgresql://...' node scripts/qa/cmp267-is-test-readback.mjs <sessionId> [sessionId...]
//   DATABASE_URL='postgresql://...' node scripts/qa/cmp267-is-test-readback.mjs --since '2026-07-29 12:00' --utm-prefix qa_
//
// DATABASE_URL 은 환경변수로만 받는다. 자격증명을 스크립트·커밋·코멘트에 남기지 않는다.
// 개인정보·자유서술 필드는 조회하지 않는다 (session_id/utm/이벤트명/표식만).
//
// 종료 코드: 0 = 조회된 행이 모두 is_test=true, 1 = 표식 없는 행 존재, 2 = 사용법/연결 오류

import { createRequire } from 'node:module';

const require = createRequire('/Users/baegchangseog/Documents/intm/');
const { Client } = require('pg');

const argv = process.argv.slice(2);
if (!process.env.DATABASE_URL) {
  console.error('[CMP267] ERROR: DATABASE_URL 환경변수가 필요합니다.');
  process.exit(2);
}

const sessions = argv.filter((a) => !a.startsWith('--') && !/^\d{4}-\d{2}-\d{2}/.test(a) && a !== 'qa_');
const sinceIdx = argv.indexOf('--since');
const prefixIdx = argv.indexOf('--utm-prefix');
const since = sinceIdx >= 0 ? argv[sinceIdx + 1] : null;
const utmPrefix = prefixIdx >= 0 ? argv[prefixIdx + 1] : null;

const filters = [];
const params = [];
if (sessions.length) {
  params.push(sessions);
  filters.push(`session_id::text = ANY($${params.length})`);
}
if (since) {
  params.push(since);
  filters.push(`occurred_at >= ($${params.length}::timestamp AT TIME ZONE 'Asia/Seoul')`);
}
if (utmPrefix) {
  params.push(`${utmPrefix}%`);
  filters.push(`utm_source LIKE $${params.length}`);
}
if (!filters.length) {
  console.error('[CMP267] ERROR: sessionId 또는 --since / --utm-prefix 중 하나는 필요합니다.');
  process.exit(2);
}

const sql = `
  SELECT session_id::text AS session_id,
         event_name,
         utm_source,
         utm_medium,
         utm_campaign,
         is_test,
         occurred_at AT TIME ZONE 'Asia/Seoul' AS kst
    FROM spacebogam_funnel_events
   WHERE ${filters.join(' AND ')}
   ORDER BY session_id, occurred_at
`;

const client = new Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
const { rows } = await client.query(sql, params);
await client.end();

if (!rows.length) {
  console.error('[CMP267] 조회된 행이 없습니다 — 세션 ID 또는 조건을 확인하십시오.');
  process.exit(2);
}

const pad = (v, n) => String(v ?? '-').padEnd(n);
console.log(pad('session_id', 38) + pad('event_name', 22) + pad('utm_source', 16) + pad('is_test', 9) + 'kst');
for (const r of rows) {
  console.log(
    pad(r.session_id, 38) +
      pad(r.event_name, 22) +
      pad(r.utm_source, 16) +
      pad(r.is_test ? 't' : 'f', 9) +
      new Date(r.kst).toISOString().replace('T', ' ').slice(0, 19),
  );
}

const unmarked = rows.filter((r) => r.is_test !== true);
const bySession = new Set(rows.map((r) => r.session_id));
console.log(
  `\n[CMP267] 세션 ${bySession.size}개 / 이벤트 ${rows.length}건, 표식 없음 ${unmarked.length}건 -> ${unmarked.length === 0 ? 'PASS' : 'FAIL'}`,
);
process.exit(unmarked.length === 0 ? 0 : 1);
