# CMP-73 헤드라인 A/B 운영 런타임 QA (2026-07-28 02:28 KST)

실행: `node scripts/qa/cmp73-headline-ab-runtime.mjs` (헤드리스 크롬, 대상 `https://spacebogam.kr` 운영 배포본)
결과: **기계적 검증 15항목 전체 PASS. 단, 카피 승인 불일치로 실험 자체는 유효하지 않음(아래 P0).**

남은 완료 기준 중 계측 관련 항목은 모두 충족됐다. **유일한 미해결 항목은 P0(카피 승인)** 이다.

## P0 — 운영 중인 B 카피가 승인 카피가 아니다 (실험 무효)

| 구분 | 카피 |
| --- | --- |
| CMP-48 브리프 승인 카피(변형 B) | 이사·입주 전 인테리어, 실제 시공 사례로 내 집의 공사 범위부터 점검하세요 |
| **현재 운영 중 B (`assets/funnel-tracking.js:202`)** | **부산 프리미엄 아파트, 우리 집에 맞는 완성도부터 잡습니다** |

- [CMP-67 실행·근거 인계](/CMP/issues/CMP-67#document-execution-handoff)는 "B: CMP-48 브리프의 승인 카피"로 계약을 명시한다.
- CMP-48·CMP-73 코멘트 전수 확인 결과 "부산 프리미엄 아파트…" 카피를 승인한 기록은 없다. 이전 런에서 임의 작성된 것으로 보인다.
- 결과적으로 현재 홈 방문 세션의 약 50%에 **미승인 카피가 노출**되고 있으며, 수집 중인 실험 데이터는 CMP-48 의사결정 근거로 쓸 수 없다.
- 추가 제약: CMP-48 승인 카피의 "실제 시공 사례" 표현은 포트폴리오 사용 권한·식별정보 처리 확인이 전제다. 그 근거를 제공하는 CMP-67이 아직 `blocked`이므로, **승인 카피로 교체하는 것도 지금은 불가**하다.

## `consultation_submit` 귀속 — 이미 충족됨 (초안의 P1은 오류였다)

- `consultation_submit`은 CMP-98에서 오탐(실제 저장 없이 제출 집계) 때문에 클라이언트에서 **의도적으로 제거**됐다. `tests/cmp98-funnel-tracking.test.js:161`이 이를 회귀 검증한다. 현재는 intm.kr 서버측에서 실제 저장 성공 후에만 발생한다.
- 이 문서 초안은 "그래서 사이트 단독으로 닫을 수 없다"고 적었으나 **틀렸다.** CMP-137이 운영 DB read-back으로 이미 실증을 마쳤다:
  - 저장 1건당 `consultation_submit` 정확히 1행
  - `experiment_id=homepage_headline_v1` + 변형 일치 (A행 `A`, B행 `B`) — PASS
  - 홈 `/` 노출부터 제출까지 단일 `session_id`, A 세션 8행 전부 `A` / B 세션 8행 전부 `B`
- 즉 **4개 이벤트 실험 귀속 완료 기준은 충족 상태**다. 이 오류로 중복 이슈 CMP-159를 만들었고 철회가 필요하다(생성 즉시 담당자를 넘겨 본인 권한으로 회수 불가 — 아래 참조).
- 실제로 남은 계측 결함은 CMP-158(`lead_form_view`/`lead_form_start`의 `experiment_variant` NULL → 폼 단계 A/B 분석 불가)이며 별도 추적 중이다. 제출 귀속에는 영향 없다.

## 검증 결과 (전체 PASS)

| 항목 | 결과 | 증거 |
| --- | --- | --- |
| 신규 세션 100개 분포 40~60 | PASS | A=43, B=57, 미배정 0 |
| 동일 세션 고정성 | PASS | 최초=A → 새로고침=A → `/consultation/`=A → 복귀=A |
| 헤드라인·변형 일치 | PASS | variant=A일 때 A 카피 노출 |
| DOM/CTA/스타일 불변 1440×900 | PASS | body HTML 동일, 링크 79개 동일, 계산 스타일 동일, H1만 상이, 노드 438/438 |
| DOM/CTA/스타일 불변 390×844 | PASS | 동일 (438/438) |
| 이벤트 실험 귀속 A | PASS | `page_view`,`engaged_session`,`consultation_click` 모두 `experimentId=homepage_headline_v1`, `experimentVariant=A` |
| 이벤트 실험 귀속 B | PASS | 동일 3종, `experimentVariant=B` |
| UTM 보존 A/B | PASS | `page_view` utm=`cmp73/qa/headline_v1_runtime` (변형값이 UTM을 덮어쓰지 않음) |
| 상담 링크 파라미터 A/B | PASS | `experiment_id`·`experiment_variant`·기존 UTM 동시 유지 |
| 클라이언트 `consultation_submit` 미발생 | PASS | CMP-98 가드 유지 |
| 전역 단일 롤백 | PASS | `GLOBAL_EXPERIMENT_VARIANT='A'` 주입 시 신규 세션 20/20 전부 A |

### 퍼널 품질 게이트 (rangeDays=28, 2026-07-27T17:24Z 생성)
- `status=ready`, `isMonotonic=true`, `utmTaggedVisitRate=0.854` (≥80%), `warnings=[]`, `sampleSessions=199` → **전 항목 통과**

## 측정 방법 주의

- ingest(`intm.kr/api/marketing/funnel-events`)는 페이지 컨텍스트에서 `window.fetch`를 감싸 본문만 기록하고 200을 흉내 낸 응답을 반환한다. **운영 퍼널 데이터를 오염시키지 않으며** 재시도도 발생하지 않는다.
- `keepalive: true` fetch는 puppeteer `req.postData()`로 본문을 읽을 수 없다(빈 값). 초기 하네스가 이 때문에 오탐 FAIL을 냈고, fetch 래핑 방식으로 교체해 해결했다.
- `page_variant`(`home_a_default`/`home_b_visit_stage_standard`)는 실험 귀속 태그이므로 A/B가 달라야 정상이다. DOM 불변 비교에서만 정규화 제외했다.

## 롤백 (정정)

- **전역 단일 롤백(정답)**: `assets/site-tracking.js:16`의 `var GLOBAL_EXPERIMENT_VARIANT = '';` → `'A'`로 바꾸고 그 파일 하나만 배포. 위 QA에서 신규 세션 20/20 전부 A 고정 확인.
- 기존 기록의 `localStorage.setItem('spacebogam_headline_v1_force_variant','A')` 콘솔 명령은 **실행한 브라우저에만 적용**되는 점검용 수단이다. 전역 롤백 수단이 아니므로 롤백 절차로 쓰면 안 된다.

## 배포 상태 — 전역 롤백 실행 완료 (2026-07-28)

보드가 확인 카드 "전역 롤백 배포 승인"을 **수락**하여 롤백을 배포했다.

- 커밋 `1ea86ea`, `origin/main` push 완료 → GitHub Pages 반영 확인.
- 변경: `assets/site-tracking.js:16` `GLOBAL_EXPERIMENT_VARIANT` `''` → `'A'`.
- 함께 배포된 미배포 커밋 6건 중 **운영 자산을 건드리는 것은 `de5b556`(CMP-151, `assets/site-tracking.js`) 하나**뿐이며 승인 카드에 명시돼 있었다. 나머지(`fe32add`, `92d0974`, `0f98d2c`, `fcd7b5a`, `25d805c`)는 `scripts/qa/**`·`reports/**`·`tests/**`로 런타임 영향이 없다.

### 롤백 후 운영 재검증 (`CMP73_SESSIONS=40`, 운영 대상)

- **신규 세션 40/40 전부 A, B=0, 미배정 0** — 미승인 카피 노출 중단 확인.
- 세션 고정성 A, 헤드라인=대조군 카피, 이벤트 3종 귀속 `A`, UTM 보존, 클라이언트 `consultation_submit` 미발생 유지.
- 하네스가 보고하는 FAIL 5건(`distribution`, `dom_invariant_*`, `events_..._B`, `consultation_link_params_B`)은 **하네스가 50:50 실험 진행을 전제로 단언**하기 때문이며, 롤백 상태에서는 기대값이 뒤집힌 것이다. 각 실패 상세가 오히려 롤백 성공 증거다(B 세션도 `experiment_variant=A`, 두 변형 H1 동일 → `h1Differs=false`). `htmlSame/ctaSame/styleSame`은 계속 true다.

### 되돌리기(실험 재개)

`GLOBAL_EXPERIMENT_VARIANT`를 `''`로 되돌리고 배포하면 50:50이 복원된다. 단 **재개 전에 P0(카피 승인)이 먼저 해소돼야 한다.**

### 부수 수정

`tests/cmp98-funnel-tracking.test.js`의 로더 테스트가 플래그 리터럴 `''`를 그대로 pin하고 있어, 이 플래그가 존재하는 목적인 롤백을 수행하면 스위트가 깨졌다. 선언 순서·단일 선언 보장은 유지한 채 값만 비의존(`'[AB]?'`)으로 바꿨다. 관련 스위트 12/12 PASS.
