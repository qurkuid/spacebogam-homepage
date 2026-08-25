#!/usr/bin/env node
// CMP-1436 — diff 기반 저위험 변경 분류기 (dry-run 전용).
// 이 스크립트는 어떤 배포/롤백 명령도 실행하지 않는다. git 두 ref 사이의 변경을
// 읽어 AUTO_ELIGIBLE / HUMAN_REQUIRED 판정과 근거만 출력한다.
//
// 사용: node risk-classifier.mjs <baseRef> <headRef> [--json]
//
// 판정 원칙: 기본값은 항상 HUMAN_REQUIRED (default-deny). 아래 안전 패턴에
// "전부" 해당할 때만 AUTO_ELIGIBLE 로 내린다. 애매하면 사람에게 넘긴다.

import { execFileSync } from 'node:child_process';

const [, , baseRef, headRef, ...rest] = process.argv;
const asJson = rest.includes('--json');
if (!baseRef || !headRef) {
  console.error('usage: risk-classifier.mjs <baseRef> <headRef> [--json]');
  process.exit(2);
}

function git(args) {
  return execFileSync('git', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
}

function showAt(ref, path) {
  try {
    return git(['show', `${ref}:${path}`]);
  } catch {
    return null; // file does not exist at this ref (added or deleted)
  }
}

// 순수 인프라/비공개 경로 — git archive 로 서빙되더라도 공개 문구·CTA·폼·가격·
// 추적ID·전환정의 중 어느 것도 담지 않는 위치. 여기 있어도 내용은 별도로 검사한다
// (예: README 에 사람이 요금표를 적어 넣는 사고를 막기 위해).
const NON_PRODUCTION_DIR = /^(scripts\/qa\/|tests\/|tools\/|\.githooks\/|docs\/)/;
const NON_PRODUCTION_FILE = /^(README\.md|[A-Z_]+\.md)$/;

// 분석/전환 판정에 쓰이는 로직 파일 — 태그 로드 "시점"만 바꾸는 안전 패턴 외에는
// 항상 사람 승인. utm/vertical 파싱, 이벤트 이름, 폼 제출 로직이 여기 있다.
const ANALYTICS_LOGIC_FILE = /^assets\/(site-tracking|funnel-tracking|commercial-call|consultation-form|preview-v8)\.(js|css)$/;

const TRACKING_ID_RE = /\b(GTM-[A-Z0-9]+|G-[A-Z0-9]+|UA-\d{4,}-\d+|AW-\d{6,}|fbq\(\s*['"]init['"]\s*,\s*['"]\d+['"]|naver_wcs[^"']{0,10}["']?\s*[:=]\s*["']?\d{6,})/g;
const PRICE_RE = /\d[\d,]{2,}\s*(원|만원)/g;
const HREF_ACTION_TEL_RE = /\b(href|action)\s*=\s*"([^"]*)"|tel:(\d[\d-]*)/g;
const FORM_FIELD_RE = /<(input|select|textarea)\b[^>]*\bname\s*=\s*"([^"]+)"/gi;

function extractVisibleText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractSet(re, text) {
  const out = new Set();
  let m;
  re.lastIndex = 0;
  while ((m = re.exec(text))) out.add(m[0]);
  return out;
}

function setsDiffer(a, b) {
  if (a.size !== b.size) return true;
  for (const v of a) if (!b.has(v)) return true;
  return false;
}

const HANGUL_RE = /[가-힣]/;
const STRING_LITERAL_RE = /(['"])((?:(?!\1)[^\\]|\\.)*)\1/g;
// pointerdown/keydown/... 은 신규 문자열이라도 CMP-1369 지연 로딩 패턴에 쓰이는
// 표준 DOM 이벤트 이름이라 안전하다고 취급한다.
const SAFE_NEW_LITERALS = new Set(['pointerdown', 'keydown', 'touchstart', 'scroll', 'load', 'complete']);
// 리터럴을 안 바꿔도 동작(귀속·이동·전송 대상)을 바꿀 수 있는 API. 8c2024f 실측:
// location.replace 대상 문자열은 그대로 두고 검색어/해시 병합 로직만 추가했는데
// 이건 UTM 전달 경로 자체를 바꾼 것이다 — 리터럴 재사용 검사만으로는 못 잡는다.
const DANGEROUS_JS_RE = /location\s*\.\s*(replace|href|assign)|\.search\b|\.hash\b|fetch\s*\(|XMLHttpRequest|sendBeacon|utm_|vertical|dataLayer\.push/i;

// diff 가 "코드"로만 이루어져 있는지 판정한다: 주석을 뺀 뒤 새로 추가된 줄에
// (a) 한글(=사람이 읽는 문구)이 없고, (b) 기존 파일에 없던 새 문자열 리터럴이
// (안전 이벤트 이름 제외) 없어야 한다. 즉 "기존 문자열/URL 을 재배치"하는 코드는
// 통과하지만 새로운 목적지·문구·ID 문자열을 도입하는 코드는 걸러진다.
function stripBlockComments(code) {
  return code.replace(/\/\*[\s\S]*?\*\//g, '');
}

function isSafeCodeDiff(oldContent, newContent) {
  if (oldContent === newContent) return true;
  const oldStripped = stripBlockComments(oldContent);
  const newStripped = stripBlockComments(newContent);
  const oldLines = new Set(oldStripped.split('\n').map((l) => l.trim()).filter(Boolean));
  const addedLines = newStripped.split('\n').map((l) => l.trim()).filter((l) => l && !oldLines.has(l));

  for (const line of addedLines) {
    if (HANGUL_RE.test(line)) return false;
    if (DANGEROUS_JS_RE.test(line)) return false;
    let m;
    STRING_LITERAL_RE.lastIndex = 0;
    while ((m = STRING_LITERAL_RE.exec(line))) {
      const literal = m[2];
      if (literal.length < 3) continue;
      if (SAFE_NEW_LITERALS.has(literal)) continue;
      if (!oldContent.includes(literal)) return false;
    }
  }
  return true;
}

function classifyFile(path, status, oldContent, newContent) {
  const reasons = [];

  if (status === 'D') {
    return { path, status, category: 'FILE_DELETED', verdict: 'HUMAN_REQUIRED', reasons: ['파일 삭제는 항상 사람 승인'] };
  }

  const isHtmlOrJs = /\.(html|js|css)$/.test(path);
  const old = oldContent ?? '';
  const cur = newContent ?? '';

  // 1) preview-v8.css 같은 전환 퍼널 스타일은 로직이 아니라 폼/CTA 배치를 바꿀 수
  // 있어 지문 검사로 걸러지지 않는다. 항상 사람 승인.
  if (ANALYTICS_LOGIC_FILE.test(path) && path.endsWith('.css')) {
    reasons.push('전환 퍼널 스타일 파일 — 폼/CTA 레이아웃에 영향 가능, 항상 사람 승인');
    return { path, status, category: 'ANALYTICS_STYLE_CHANGED', verdict: 'HUMAN_REQUIRED', reasons };
  }

  // 2) 순수 인프라 경로 — 그래도 공통 검사(5)는 통과해야 한다.
  const isNonProdPath = NON_PRODUCTION_DIR.test(path) || NON_PRODUCTION_FILE.test(path);

  // 3) HTML: 공개 문구 diff
  if (path.endsWith('.html')) {
    const oldText = extractVisibleText(old);
    const newText = extractVisibleText(cur);
    if (oldText !== newText) {
      reasons.push('공개 문구(가시 텍스트) 변경 감지');
      return { path, status, category: 'PUBLIC_COPY_CHANGED', verdict: 'HUMAN_REQUIRED', reasons };
    }
  }

  // 4) 폼 필드 지문
  const oldFields = extractSet(FORM_FIELD_RE, old);
  const newFields = extractSet(FORM_FIELD_RE, cur);
  if (setsDiffer(oldFields, newFields)) {
    reasons.push(`폼 필드 구성 변경 (${oldFields.size} → ${newFields.size})`);
    return { path, status, category: 'FORM_FIELD_CHANGED', verdict: 'HUMAN_REQUIRED', reasons };
  }

  // 5) 공통 검사: CTA 목적지 / 가격 / 추적ID 지문
  const oldLinks = extractSet(HREF_ACTION_TEL_RE, old);
  const newLinks = extractSet(HREF_ACTION_TEL_RE, cur);
  if (setsDiffer(oldLinks, newLinks)) {
    reasons.push('CTA 목적지(href/action/tel) 변경');
    return { path, status, category: 'CTA_DESTINATION_CHANGED', verdict: 'HUMAN_REQUIRED', reasons };
  }

  const oldPrice = extractSet(PRICE_RE, old);
  const newPrice = extractSet(PRICE_RE, cur);
  if (setsDiffer(oldPrice, newPrice)) {
    reasons.push('가격 표기 변경');
    return { path, status, category: 'PRICE_CHANGED', verdict: 'HUMAN_REQUIRED', reasons };
  }

  const oldTrack = extractSet(TRACKING_ID_RE, old);
  const newTrack = extractSet(TRACKING_ID_RE, cur);
  if (setsDiffer(oldTrack, newTrack)) {
    reasons.push('추적 ID(GTM/GA/Pixel/UTM 계열) 변경');
    return { path, status, category: 'TRACKING_ID_CHANGED', verdict: 'HUMAN_REQUIRED', reasons };
  }

  // 여기까지 왔으면: 공개 문구·CTA·폼·가격·추적ID 지문이 모두 동일.
  if (isNonProdPath) {
    reasons.push('비공개/인프라 경로, 공개 표면 지문 변화 없음');
    return { path, status, category: 'NON_PRODUCTION_INFRA', verdict: 'AUTO_ELIGIBLE', reasons };
  }
  if (old === cur) {
    reasons.push('내용 변화 없음');
    return { path, status, category: 'NO_OP_OR_ASSET', verdict: 'AUTO_ELIGIBLE', reasons };
  }
  if (isHtmlOrJs && isSafeCodeDiff(old, cur)) {
    reasons.push('태그 로드 시점 지연 패턴과 일치 + 공개 표면 지문 변화 없음');
    return { path, status, category: 'PERFORMANCE_TAG_TIMING', verdict: 'AUTO_ELIGIBLE', reasons };
  }
  // 지문 검사를 통과했어도, 알려진 안전 패턴과 불일치하는 변경은 기본값(사람 승인)으로 떨어뜨린다.
  reasons.push('알려진 안전 패턴에 해당하지 않는 미분류 변경 — 기본값(사람 승인) 적용');
  return { path, status, category: 'UNCLASSIFIED_CHANGE', verdict: 'HUMAN_REQUIRED', reasons };
}

function main() {
  // -z: NUL로 구분된 원본 경로. 한글 등 비-ASCII 파일명을 core.quotepath 이스케이프
  // 없이 그대로 받기 위함 (예: 블로그 글 파일명).
  const nameStatus = git(['diff', '--name-status', '-z', baseRef, headRef]);
  const tokens = nameStatus.split('\0').filter((t) => t.length > 0);
  const files = [];
  for (let i = 0; i < tokens.length; i += 2) {
    files.push({ status: tokens[i][0], path: tokens[i + 1] });
  }

  const results = files.map(({ status, path }) => {
    const oldContent = status === 'A' ? null : showAt(baseRef, path);
    const newContent = status === 'D' ? null : showAt(headRef, path);
    return classifyFile(path, status, oldContent, newContent);
  });

  const verdict = results.some((r) => r.verdict === 'HUMAN_REQUIRED') ? 'HUMAN_REQUIRED' : 'AUTO_ELIGIBLE';
  const out = { baseRef, headRef, verdict, fileCount: results.length, files: results };

  if (asJson) {
    console.log(JSON.stringify(out, null, 2));
  } else {
    console.log(`${headRef.slice(0, 12)}  ${verdict}  (${results.length} files)`);
    for (const r of results) {
      console.log(`  [${r.verdict === 'AUTO_ELIGIBLE' ? 'AUTO ' : 'HUMAN'}] ${r.path} — ${r.category}: ${r.reasons.join('; ')}`);
    }
  }
}

main();
