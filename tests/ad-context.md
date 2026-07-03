# 광고 컨텍스트 SSOT (2026-07-03 기준, 집행 중)

하네스 Score/Scope/Review 게이트는 이 파일을 기준으로 "광고 연결성"을 판단한다.
광고 변경 시 이 파일부터 갱신할 것.

## 캠페인
- 캠페인 ID 120247183634960650 · 목적 LINK_CLICKS · 일예산 합계 10,000원
- 타게팅: 부산 17km(거주+최근), 25~65+, 전체 성별, 한국어, Advantage Audience ON, 게재위치 자동

## 활성 광고 → 랜딩 매핑
| 광고 | 광고세트 | 핵심 메시지 | CTA | 랜딩 | utm_campaign / utm_content |
|---|---|---|---|---|---|
| T1 | NEW_TEST | 주방·거실 동선 정돈, 매일 머무는 공간 | SEE_DETAILS | /ab/home-b/ | spacebogam_home_landing_ab_20260701 / T1_copy_kitchen_home_b (term=landing_b) |
| T4 | NEW_TEST | 편안해지는 공간, 주방·거실 정돈 사례 | SEE_DETAILS | /ab/home-b/ | spacebogam_home_landing_ab_20260701 / T4_photo_kitchen_home_b (term=landing_b) |
| T3 | NEW_TEST | 부산 지역성("집과 동네 결"), 시공 사례 | LEARN_MORE | / | spacebogam_5slot_ad_ready_20260701 / T3_copy_busan |
| R2 | BASELINE | 사직쌍용예가 1차 사례 보고 상담 | SEE_DETAILS | / | ai_ad_test / R2_OPEN |
| R3 | BASELINE | 사직쌍용예가 1차 **주방** 사례, 구축 32평 | SEE_DETAILS | / | ai_ad_test / R3_KITCHEN |

## 랜딩별 기대 콘텐츠 (유입자가 3초 안에 찾아야 하는 것)
- `/` (T3·R2·R3): 부산 지역성 신호, 실제 시공 사례 사진, **사직쌍용예가 1차·주방 사례 접점**, 상담 CTA
- `/ab/home-b/` (T1·T4): 주방·거실 동선·정돈 서사, 사례 사진, 상담 CTA

## 측정 보존 필수값 (site-tracking.js 가 처리 — 제거/변경 금지)
- utm_source · utm_medium · utm_campaign · utm_content · utm_term · fbclid (상담 링크로 이월)
- 상담 클릭(generate_lead·click_consultation) · 전화 클릭(click_call) · 카카오 클릭
- A/B 구분: root(home_a_default) vs /ab/home-b/(home_b_visit_stage_standard) — body class·경로 기반

## 메시지 방향 (금지: 최저가 강조, 공포 소구)
부산 지역성 → 주방·거실 동선 → 실제 사례 확인 → 상담 전 신뢰 확보 → 편안한 공간 정돈
