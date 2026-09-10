# CMP-260 검증 결과 — QA 프로브 상담 제출의 실제 전환 집계 여부

- 일자: 2026-07-29
- 방식: 운영 DB **읽기 전용** 조회만 수행. 운영 데이터 변경·광고 변경·외부 게시 **없음**.
- 결론: **이슈 전제는 성립하지 않는다.** 지목된 2건은 이미 제외되어 있고, CMP-49 실험의 집계 전환은 A·B 모두 **0건**이다. 백필 불필요.

## 1. 핵심 반증 — `is_active` 게이트 누락

이슈 본문은 제외 술어로 `testFunnelEventSql()` (`is_test` / `utm_source ILIKE 'qa%'` / `utm_campaign ILIKE 'qa%'`) **만** 적용했다. 그러나 운영 집계(`repository-report-inputs.ts`)는 **2단 게이트**다.

```sql
-- 1단 (filtered_events CTE)
WHERE company_id = $1 AND occurred_at ... AND is_active = true
-- 2단
COUNT(DISTINCT session_id) FILTER (
  WHERE event_name IN ('lead_submit_success','consultation_submit')
    AND NOT (is_test = true OR utm_source ILIKE 'qa%' OR utm_campaign ILIKE 'qa%')
)
```

지목된 두 세션은 **1단에서 이미 탈락**한다.

| sess | kst | is_active | is_test | utm_source | 변형 |
|---|---|---|---|---|---|
| `d8086712` | 07-28 00:58:39 | **f** | f | spacebogam.kr | A |
| `90440f32` | 07-28 00:59:38 | **f** | f | spacebogam.kr | B |

`is_active=false` 는 CMP-157 이 QA 리드를 지표에서 제외할 때 쓴 **주된 수단**이다. 즉 표식은 이미 붙어 있었고, 붙은 위치가 `is_test` 가 아니라 `is_active` 였을 뿐이다.

## 2. 완료 조건별 판정

### 조건 2 — 운영 제외 술어 재조회 시 `counted_as_real = 0`

**이미 충족.** 백필 없이 현재 상태로 성립한다.

```
ev | total_sessions | counted_as_real
A  |       5        |       0
B  |       1        |       0
```

→ CMP-49 의 "A 1전환 / B 1전환" 허위 신호는 **운영 집계에 존재하지 않는다.** 2026-08-02 체크포인트는 이 사유로는 오염되지 않았다.

### 조건 1 — `is_test = true` 백필

**불필요. 수행하지 않음.** 근거 두 가지:

1. 퍼널 측: `is_active=false` 로 이미 제외됨(위 §1).
2. 원천 측: 대응 `consult_req` 327 / 328 은 `marketing_attribution.is_test = 'true'` 이며 이름도 QA 브래킷 규칙에 맞아 `testConsultationSql()` 로 **이미 제외**된다.

지표 효과가 0인 운영 데이터 쓰기를 승인 없이 수행하지 않았다. 감사 명료성 차원의 추가 표식이 필요하다면 대표 승인 후 별건으로 처리하는 것을 권고한다(권고: 불필요).

### 조건 3 — `8d17f4b6` 배포 이전 다른 미표식 QA 행 확인

**수행 완료. 추가 누수 없음.**

2026-07-28 00:00 KST 이전 생성분 중 2단 게이트를 모두 통과하는 행을 전수 집계한 결과, **submit 단계 이벤트는 0건**이다. 통과하는 것은 `page_view` / `scroll_50` / `engaged_session` / `portfolio_click` 등 상단 단계 브라우징 트래픽뿐이다(상단 단계 오염은 별건 CMP-225 / CMP-227 범위).

보조 검증으로 "전체 트레일 60초 미만 + submit 도달" 프로브 서명 스캔을 전 기간에 걸쳐 돌렸다. 검출된 7세션 중 6건은 이미 제외 상태이며, 미제외 1건은 아래 §3 의 별건이다.

## 3. 부수 발견 — 방향이 반대인 실제 누수 (이미 별건 등록됨)

이슈가 지목한 방향(QA 가 실적으로 잡힘, `consultation_submit`)이 아니라, **`lead_submit_success` 단계에서 원천은 제외되는데 퍼널은 실적으로 잡히는** 비대칭이 실재한다.

| sess | req | kst | 퍼널 집계 | 원천 제외 | 비고 |
|---|---|---|---|---|---|
| `4d7a293f` | 334 | 07-29 10:52 | **실적으로 집계** | 제외됨 | 16초 제출, `cmp99_estimate_scope_r7` |
| `091effcf` | 333 | 07-29 10:30 | 실적으로 집계 | 미제외 | 4분27초, utm 없음 — 실제 고객 가능성 |

원인은 두 술어의 비대칭이다. 원천은 이름 규칙(`^\s*\[(QA|CMP-[0-9]+)`)을 쓰지만 퍼널 이벤트 테이블에는 `name` 컬럼이 없어 `utm_source ILIKE 'qa%'` 에 의존하는데, `utm_source=instagram` 인 QA 건은 여기를 빠져나간다.

**이미 등록된 별건이라 신규 이슈를 만들지 않았다:**
- CMP-270 (backlog) — 검증용 상담 `consult_req 334` 소프트 삭제
- CMP-267 (todo) — QA 재현 스크립트가 표식 없이 운영 퍼널에 쓴다
- CMP-244 / CMP-253 — `lead_submit_success` 원천 불일치(lead_overcount)

이 건들은 CMP-49 실험 지표에는 영향이 없다. 해당 이벤트에 `experiment_id` / `experiment_variant` 가 **없기** 때문이다.

## 4. 재현 방법

조회 SQL 은 `scripts/qa/cmp260-funnel-exclusion-audit.sql` 에 보존했다. 접속 경로는 INTM 리포 `.env.local` 의 `DATABASE_URL` 이며, 자격증명 값은 이 문서·코멘트·로그 어디에도 남기지 않았다.

## 5. 남은 판단

- CMP-260 은 전제 반증으로 종결 권고.
- CMP-49 2026-08-02 체크포인트는 이 사유로는 재조정 불필요. 단, **실제 고객 전환은 A·B 모두 0건**이므로 표본 부족 자체는 그대로 남는다 — 판정 가능 여부는 별도 문제다.
