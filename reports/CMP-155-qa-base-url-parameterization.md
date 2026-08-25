# CMP-155 — QA 스크립트 대상 URL 파라미터화 (BASE_URL) 검증

- 일시: 2026-08-25 (KST)
- 검사 대상 BASE_URL: 두 모드 모두 실행 — `http://127.0.0.1:3023`(preview) / 기본값 `https://spacebogam.kr`(배포본)
- 계기: [CMP-155](/CMP/issues/CMP-155), 배경: [CMP-142](/CMP/issues/CMP-142) 배포 경로 분리(RUNBOOK: `/Volumes/DATABASE/spacebogam/RUNBOOK.md`)
- 도구: Chrome for Testing 1228(puppeteer-core), curl, node
- 운영 쓰기: cmp141(2회), cmp96-runtime-recheck(2회), cmp96-consultation-formstart(1회, preview만)는 실제 intm.kr 퍼널 이벤트를 남김(모두 `is_test=1`/`isTest:true`, 기존부터 있던 동작·무변경). cmp137은 `DRY_RUN=1`로만 실행 — 상담 레코드 생성 없음.

## 정정: RUNBOOK 경로가 실제와 달랐다

작업 착수 시 `/usr/local/var/www/spacebogam/RUNBOOK.md`를 먼저 읽었는데, 그 문서 자체가
**폐기 배너**로 현재 런북은 `/Volumes/DATABASE/spacebogam/RUNBOOK.md`라고 명시하고 있었다.
실제로 `com.spacebogam.site`(포트 3021)는 `node /Volumes/DATABASE/spacebogam/serve.js`를
서빙 중이었고 `/usr/local/var/www/spacebogam`는 아무도 읽지 않는 버려진 트리였다(`ps` 로 확인,
CMP-661 이 이미 정리한 사실). CMP-155 이슈 설명의 "참고" 링크가 옛 경로를 가리키고 있어
착오를 유발할 수 있으므로 여기 남긴다 — 실제 검증은 현재 런북 기준으로 진행했다.

## 판정: **PASS**

| # | 산출물 | 결과 | 근거 |
|---|---|---|---|
| 1 | 5개 스크립트가 BASE_URL 로 대상 전환 | **PASS** | 아래 §1 |
| 2 | 각 실행 로그 첫 줄에 대상 URL 출력 | **PASS** | 아래 §1 (cmp129 는 stdout 이 JSON 산출물이라 stderr 로 출력 — §3 참고) |
| 3 | 커밋 전 편집 상태에서 두 모드 결과가 다름을 증거로 남김 | **PASS** | 아래 §2 |

## §1. BASE_URL 전환 확인 (모든 스크립트 첫 줄)

```
$ BASE_URL=http://127.0.0.1:3023 node scripts/qa/cmp96-runtime-recheck.mjs .
[CMP96] target BASE_URL = http://127.0.0.1:3023

$ node scripts/qa/cmp96-runtime-recheck.mjs .              # BASE_URL 미지정
[CMP96] target BASE_URL = https://spacebogam.kr

$ BASE_URL=http://127.0.0.1:3023 node scripts/qa/cmp96-consultation-formstart.mjs .
[CMP96-formstart] target BASE_URL = http://127.0.0.1:3023

$ BASE_URL=http://127.0.0.1:3023 VARIANT=A DRY_RUN=1 node scripts/qa/cmp137-consultation-submit-flow.mjs
[CMP137] target BASE_URL = http://127.0.0.1:3023

$ BASE_URL=http://127.0.0.1:3023 scripts/qa/cmp141-funnel-session.sh A
[CMP141] target BASE_URL = http://127.0.0.1:3023

$ BASE_URL=http://127.0.0.1:3023 node scripts/qa/cmp129-utm-content-relay.js 2>&1 1>/dev/null
[CMP129] target BASE_URL = http://127.0.0.1:3023 (콘텐츠는 항상 로컬 작업 트리 — 위 주의 참조)
```

## §2. 커밋 전 편집 재현 (H1 임시 마커, 커밋하지 않고 복원함)

`index.html` `<h1>`에 `[CMP155-QA-TEMP]`를 임시로 붙이고 `cmp96-runtime-recheck.mjs`를 두
모드로 실행 — **커밋 전 상태**를 preview 는 보고 배포본은 못 보는 것을 확인한 뒤 원복했다.

| 모드 | H1 결과 |
|---|---|
| `BASE_URL=http://127.0.0.1:3023` | `예쁜 완성보다, 먼저 확인할 것이 있습니다[CMP155-QA-TEMP]` |
| 미지정(`https://spacebogam.kr`) | `예쁜 완성보다, 먼저 확인할 것이 있습니다` (마커 없음) |

이게 이 이슈가 막으려는 오탐의 정확한 반례다 — BASE_URL 파라미터화 전이었다면 두 모드가
똑같이 배포본만 봤을 것이다.

## §3. cmp129 는 구조적으로 다른 스크립트 — BASE_URL 영향 범위가 다르다

`cmp129-utm-content-relay.js`는 puppeteer 로 페이지를 받아오지 않는다. `fs.readFileSync` 로
`index.html`/`consultation/index.html`/`assets/*.js` 를 **로컬 작업 트리에서 직접** 읽어
jsdom 에 주입하고, `fetch` 도 전부 스텁이다. 즉 **검사되는 콘텐츠는 BASE_URL 과 무관하게
항상 커밋 전 로컬 상태다** — CMP-142 컷오버 오탐 위험에 애초에 노출되지 않는 스크립트다.

BASE_URL 은 이 스크립트에서 두 가지만 바꾼다: (1) jsdom 상대 링크 해석에 쓰는 origin,
(2) `isConsultLink` 의 호스트 판정 기준(하드코딩된 `spacebogam.kr` 대신 `new URL(BASE_URL).hostname`
와 동적 비교). 실측: 두 모드 모두 `consultationLinkCount: 5` 로 동일 — 하드코딩을 걷어내면서
매칭 로직이 깨지지 않았음을 확인했다. 배포된 실제 HTML 을 검사하려는 목적이면 이 스크립트가
아니라 cmp96/cmp137 을 쓸 것.

첫 줄 출력은 stdout 이 아니라 **stderr** 로 뺐다 — 이 스크립트의 stdout 마지막 줄은
`console.log(JSON.stringify(results))` 이고, 과거 리포트(CMP-129)에서 이 출력을 그대로
파일로 리다이렉트해 파싱한 전례가 있어 stdout 을 순수 JSON 으로 유지해야 한다.

## §4. 부수 발견 — intm.kr 수집 엔드포인트가 preview origin 을 막는다 (별도 후속 필요)

`http://127.0.0.1:3023` 를 Origin 으로 보내면 `intm.kr` 이 CORS/서버단에서 거부한다:

```
$ BASE_URL=http://127.0.0.1:3023 scripts/qa/cmp141-funnel-session.sh A
[CMP141] page_view -> HTTP 403 {"error":"Origin not allowed."}
```

`cmp96-runtime-recheck.mjs`, `cmp96-consultation-formstart.mjs`, `cmp137-...-flow.mjs` 를
preview 모드로 돌렸을 때도 브라우저 콘솔에 동일한 CORS 차단이 찍혔다(퍼널 이벤트 전송 실패,
페이지 렌더링/폼 진행 자체는 정상). **즉 BASE_URL=preview 는 "페이지 콘텐츠"는 정확히
검증하지만 "퍼널 ingest 왕복"은 검증하지 못한다** — intm.kr 쪽 CORS 허용목록에
`http://127.0.0.1:3023` 이 없기 때문이며, spacebogam-homepage 저장소 밖의 문제다.
이 이슈 범위는 아니라고 판단해 여기서 멈추고 별도 이슈로 넘긴다(§5).

## §5. 다음 연결 (제안)

1. **[후속 이슈 제안]** intm.kr 퍼널 수집 API 의 CORS 허용목록에 `http://127.0.0.1:3023` 추가 —
   §4 로 preview 모드에서 ingest 왕복까지 검증 가능해짐. intm.kr 저장소 소유 범위라 이 회사(spacebogam)
   에이전트가 직접 고칠 수 없음 — 결정 필요.
2. RUNBOOK.md 참고 링크 정정: CMP-155 이슈 설명의 "참고: `/usr/local/var/www/spacebogam/RUNBOOK.md`"
   를 `/Volumes/DATABASE/spacebogam/RUNBOOK.md` 로 바꾸면 다음에 착수하는 에이전트/사람이
   같은 착오를 반복하지 않는다(사소한 문서 수정, 저위험).
3. `/Volumes/DATABASE/spacebogam/RUNBOOK.md` §140 "남은 노출"이 `scripts/qa/*` 를 여전히
   공개 노출로 적고 있는데, `.gitattributes` 에는 이미 `scripts/ export-ignore` 가 있어(CMP-168)
   해소된 상태로 보인다 — 문서만 갱신되지 않은 것으로 추정. 이 이슈 범위 밖이라 확인만 남김.
