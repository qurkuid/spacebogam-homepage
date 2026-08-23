#!/usr/bin/env node
// CMP-1340 재발 방지 장치: 디렉터리형 리다이렉트 스텁(예: /commercial/index.html)이
// 도달 URL에서 요청의 쿼리스트링(UTM 등)과 해시를 잃지 않는지 검사한다.
//
// 왜 필요한가: 이 스텁들은 생성 스크립트가 없는 수기 작성 HTML이라 한 파일만 고치고
// 나머지를 빠뜨리기 쉽다. 정규식으로 특정 코드 패턴만 확인하면 리팩터링에 취약하므로,
// 실제로 각 스텁의 리다이렉트 스크립트를 실행해 최종 location.replace() 인자에
// 주입한 UTM/해시가 살아있는지를 확인한다.
//
// 사용: node scripts/qa/lib/check-directory-stub-utm.mjs
// 종료 코드: 0 = 위반 없음, 1 = 위반 있음

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const QA_DIR = dirname(dirname(fileURLToPath(import.meta.url)));
const REPO = dirname(dirname(QA_DIR));

const SKIP_DIRS = new Set(['.git', 'node_modules', '.omc', '.omx']);
const PROBE_SEARCH = '?utm_source=cmp1340_guard&utm_content=probe_value';
const PROBE_HASH = '#probe-hash';

function listStubCandidates(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...listStubCandidates(full));
    } else if (entry.name === 'index.html' && dirname(full) !== REPO) {
      out.push(full);
    }
  }
  return out;
}

function extractRedirectScript(html) {
  // 리다이렉트 스텁의 특징: <meta http-equiv="refresh" ...> + location.replace(...) 를 담은 인라인 <script>
  if (!/http-equiv="refresh"/.test(html)) return null;
  const match = html.match(/<script>([^<]*location\.replace\([^<]*)<\/script>/);
  return match ? match[1] : null;
}

function simulateRedirect(script, file) {
  let target = null;
  const sandbox = {
    location: {
      search: PROBE_SEARCH,
      hash: PROBE_HASH,
      replace(url) {
        target = url;
      },
    },
  };
  vm.createContext(sandbox);
  try {
    vm.runInContext(script, sandbox, { timeout: 1000 });
  } catch (err) {
    return { error: `스크립트 실행 실패: ${err.message}` };
  }
  if (target === null) return { error: 'location.replace() 가 호출되지 않았습니다.' };
  return { target };
}

const stubFiles = listStubCandidates(REPO).sort();
const violations = [];
let checked = 0;

for (const file of stubFiles) {
  const html = readFileSync(file, 'utf8');
  const script = extractRedirectScript(html);
  if (!script) continue; // 리다이렉트 스텁이 아님 (일반 index.html)
  checked++;

  const result = simulateRedirect(script, file);
  const rel = relative(REPO, file);
  if (result.error) {
    violations.push({ file: rel, reason: result.error });
    continue;
  }
  if (!result.target.includes('utm_content=probe_value')) {
    violations.push({ file: rel, reason: `쿼리스트링(UTM) 유실: 도달 URL = ${result.target}` });
    continue;
  }
  if (!result.target.includes(PROBE_HASH)) {
    violations.push({ file: rel, reason: `해시 유실: 도달 URL = ${result.target}` });
  }
}

if (checked === 0) {
  console.error('[CMP-1340] 검사 대상 리다이렉트 스텁을 하나도 찾지 못했습니다 — 탐지 로직을 확인하세요.');
  process.exit(1);
}

if (violations.length === 0) {
  console.log(`[CMP-1340] OK — 디렉터리형 리다이렉트 스텁 ${checked}개 전수가 UTM/해시를 보존합니다.`);
  process.exit(0);
}

console.error(`[CMP-1340] 위반 ${violations.length}건 / 검사 ${checked}건 — 리다이렉트 스텁이 UTM 또는 해시를 잃습니다.\n`);
for (const v of violations) {
  console.error(`  ${v.file}`);
  console.error(`    ${v.reason}`);
}
console.error('\n고치는 법: location.replace() 호출 전에 location.search + location.hash 를 대상 URL에 병합하세요.');
process.exit(1);
