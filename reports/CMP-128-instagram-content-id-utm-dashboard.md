# CMP-128 인스타그램 content_id/UTM 규칙 + 주간 대시보드

- 기준일: 2026-07-27 KST
- 근거 전략: [CMP-123](/CMP/issues/CMP-123#document-plan) §7 "상담 전환 및 계측" (승인됨, 2026-07-27 완료)
- 상위 측정 계약: [CMP-14](../reports/CMP-14-conversion-measurement-ops-qa.md) 전환 측정 운영 명세·QA (UTM 5종 저장, `lead_id` 원장 구조, 유효 상담 정의를 그대로 재사용)
- 승인 상태: 식별 규칙·대시보드 정의·측정 준비 상태 점검까지만 확정. 광고비 집행, 계정 변경, 외부 게시는 포함하지 않는다.
- 목적: 좋아요·팔로워가 아니라 **인스타그램에서 발생한 유효 상담 유입 건수**로 콘텐츠 성과를 판독한다.

## 1. content_id 식별 규칙

CMP-123 §7에서 승인된 규칙을 그대로 운영 규칙으로 확정한다.

| 구분 | 형식 | 예시 |
|---|---|---|
| 주제 루트 | `ig-YYYYMM-topic` | `ig-202608-basement` |
| 릴스 | `{주제루트}-r{n}` | `ig-202608-basement-r1` |
| 피드 | `{주제루트}-f{n}` | `ig-202608-basement-f1` |
| 스토리 | `{주제루트}-s{n}` | `ig-202608-basement-s1` |

규칙:

- `topic`은 영문 소문자·하이픈만 사용하고 한글·공백·개인정보를 넣지 않는다.
- 같은 주제 루트에서 같은 형식을 반복 게시하면 `n`을 증가시킨다(`r1`→`r2`). 재게시(동일 소재 스토리 재공유 등)는 새 `content_id`를 만들지 않고 원본을 재사용한다.
- 하나의 `content_id`는 하나의 게시물에만 대응한다. 여러 슬라이드로 구성된 캐러셀도 게시물 단위로 1개의 `content_id`를 쓴다.
- 이전 리비전을 대체하는 재게시는 `superseded` 표기를 유지한다(CMP-123 §2 규칙 계승).

### UTM 매핑

| 파라미터 | 값 | 비고 |
|---|---|---|
| `utm_source` | `instagram` | 고정값 |
| `utm_medium` | `organic-social` | 고정값(유료 소재는 CMP-14 §3.1의 `paid_social` 사용) |
| `utm_campaign` | `{주제루트}` | 예: `ig-202608-basement` |
| `utm_content` | `{content_id}` | 예: `ig-202608-basement-r1` |
| `utm_term` | 미사용(기본 생략) | 오디언스 세그먼트 구분이 필요할 때만 승인 후 사용 |

적용 위치: 프로필 bio 링크, 스토리 링크 스티커, 하이라이트 링크, DM 자동응답 링크 등 상담 랜딩으로 연결되는 모든 지점. 임의 URL·축약 링크를 금지하고 CMP-14 §3.1 허용값·소문자 규칙을 그대로 따른다.

## 2. 데이터 출처 3원

지표별 출처가 다르므로 조인 키는 사람이 아니라 `content_id`(=`utm_content`)와 `utm_campaign`이다. 개별 방문자 식별자로 조인하지 않는다.

| 출처 | 제공 지표 | 수집 방식 |
|---|---|---|
| Instagram Insights(네이티브) | 도달, 3초 유지율, 완주율(릴스), 저장, 공유, 프로필 방문, 스토리 답변 | 게시물별 수동/Business Suite 조회, 주 1회 기록 |
| 웹 트래킹(`assets/funnel-tracking.js`, `assets/site-tracking.js`) | 링크탭 이후 랜딩 방문, UTM 도착 여부, 폼 시작/제출 | 기존 `UTM_KEYS`(`utm_source/medium/campaign/content/term`) 30일 보존 로직 재사용(변경 없음) |
| INTM 상담 원장 | DM/폼 상담 생성, 유효 상담 판정 | CMP-14 §4.1 유효 상담 기준 재사용 |

## 3. 주간 대시보드 정의

기간은 KST 기준 게시 주차. 행 단위는 `content_id` 1개.

| 열 | 정의 | 단계 |
|---|---|---|
| `content_id` / `format` / `topic_root` / `published_at_kst` | 식별 정보 | — |
| `reach` | Instagram Insights 도달 | 발견 |
| `retention_3s_pct` | 3초 이상 시청 비율(릴스/스토리) | 발견 |
| `completion_pct` | 완주율(릴스만, 피드는 `N/A`) | 발견 |
| `saves`, `shares`, `profile_visits` | Instagram Insights 신뢰 지표 | 신뢰 |
| `story_replies` | 스토리 답변 수(스토리 전용, 그 외 `N/A`) | 행동 |
| `link_taps` | UTM 도착 랜딩 방문 수(`utm_content=content_id`) | 행동 |
| `dm_or_form_leads` | 같은 `content_id`로 귀속된 DM 상담 시작 + 폼 제출 리드 수 | 행동 |
| `qualified_consultations` | CMP-14 §4.1 기준 유효 상담 수 | 매출전단계 |
| `qualified_rate` | `qualified_consultations / (qualified + unqualified)`, `pending` 제외 표시 | 매출전단계 |
| `sample_status` | `sufficient` / `insufficient_sample`(§4 판독 규칙) | — |
| `attribution_window_status` | `open`(게시 후 14일 이내) / `closed`(14일 경과) | — |

판정 질문(§7 원안 유지):

- 발견: 훅이 목표 고객의 문제를 붙잡았는가?
- 신뢰: 실용적 판단 기준이었는가?
- 행동: CTA가 한 가지로 명확했는가?
- 매출전단계: 실제 공사 검토 고객이 들어왔는가?

## 4. 판독 규칙

1. **귀속 창(attribution window)**: 게시 후 14일 이내 발생한 `link_taps`/`dm_or_form_leads`/`qualified_consultations`만 해당 `content_id`에 귀속한다. 14일 경과 후 발생하는 후속 상담은 자동으로 재귀속하지 않고 별도 `latest-touch` 참고값으로만 표시한다.
2. **표본 부족 처리**: 유효 상담 표본이 **5건 미만**이면 `sample_status=insufficient_sample`로 기록하고 승패를 판정하지 않는다. `qualified_rate`는 참고용으로만 노출하고 성과 결론에 사용하지 않는다(CMP-14 §5.1 소표본 처리와 동일 원칙).
3. **바이럴리티 지표 단독 사용 금지**: 좋아요·팔로워 증가만으로 콘텐츠 성과를 주장하지 않는다. 반드시 신뢰 단계(저장률·공유) 또는 매출전단계(유효 상담) 지표와 동반 판단한다.
4. **분모 0 처리**: 해당 주차 발행물이 없으면 행을 생략하지 않고 `N/A`로 표시해 누락과 구분한다.
5. **개인정보**: 대시보드에는 `content_id`, UTM, 집계 수치만 노출한다. 이름·전화번호·상담 원문은 포함하지 않는다(CMP-14 §1 개인정보 원칙 계승).

## 5. 측정 준비 상태 점검 (2026-07-27 정적 검토)

| 항목 | 상태 | 근거 |
|---|---|---|
| `utm_content` 캡처(랜딩 도착 시) | 확인됨 | `assets/funnel-tracking.js:10` `UTM_KEYS`에 `utm_content` 포함, 30일 로컬 보존 후 상담 링크에 전달 |
| `utm_content` GA4/Meta 이벤트 전달 | 확인됨 | `assets/site-tracking.js:19,225` UTM 5종에 `utm_content` 포함 |
| 상담 링크에 UTM 보존 전달 | 확인됨(CMP-14 §1.1 재확인) | `sbClientId`, `sbSessionId`, UTM을 INTM 상담 링크에 부착 |
| 폼 제출 시 서버 저장값에 `utm_content`(=`content_id`) 일치 여부 | **확인됨** ([CMP-129](../reports/CMP-129-utm-content-lead-ledger-verification.md), 2026-07-27) | 랜딩→`funnel-tracking.js` 30일 attribution→상담 링크→INTM 폼 `marketingAttribution`→`consult_req.utm_content` 경로 실측 확인(UTM 있음/없음 2건 + 경계 3건). 자기참조 UTM이 저장된 attribution을 덮어쓰지 못하던 결함 1건 발견·수정(`assets/funnel-tracking.js`, 커밋 9b56dab) |
| Instagram Insights 지표 수집 절차(도달/저장/공유/프로필방문) | 미착수 | 콘텐츠 매니저/퍼포먼스 분석가가 게시 후 주 1회 수동 기록 필요 — 별도 SOP 확정을 CMP-134으로 위임 |

**결론**: 식별 규칙, 대시보드 정의, 측정 준비 상태(폼→리드 원장 UTM 도달 포함)가 모두 확정됐다. §3의 `qualified_consultations` 행은 이제 `content_id`로 정상 귀속될 준비가 됐다. 남은 공백은 이 이슈 범위 밖의 두 가지뿐이다: (1) 영구 `lead_id`↔`sbClientId`/`sbSessionId` 매핑(CMP-14 §1.1, INTM 서버 소유), (2) 전화·카카오 경유 리드는 UTM이 붙지 않아 `content_id` 귀속이 원천적으로 불가능(대시보드에 "귀속 불가" 구간으로 별도 표기 필요).

## 6. 다음 행동

- [x] 웹 전환 엔지니어가 랜딩→폼 제출 경로 UTM 손실 없음을 검증 — [CMP-129](../reports/CMP-129-utm-content-lead-ledger-verification.md) 완료, 결함 1건 수정
- [ ] 콘텐츠 매니저/퍼포먼스 분석가가 게시 후 Instagram Insights 지표(도달·3초 유지율·저장·공유·프로필 방문) 주 1회 수동 기록 SOP를 확정 — CMP-134으로 위임
- [ ] 첫 실제 게시물에 이 규칙을 적용해 §3 표를 1회 채워보고 표본 부족 여부를 표시(콘텐츠 실제 게시 후 진행, 이 이슈 범위 밖)
