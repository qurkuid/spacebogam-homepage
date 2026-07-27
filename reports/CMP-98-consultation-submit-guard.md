# CMP-98 상담 제출 오탐 차단 및 전역 A 롤백

## 결과

- 정적 홈페이지는 URL 쿼리를 상담 저장 성공으로 판단하지 않는다.
- `consultation_submit`, `submit_success`, `submitted`, `complete`, `success` 쿼리와 새로고침은 `consultation_submit`을 만들지 않는다.
- 실제 저장 성공 이벤트는 INTM의 상담 저장 트랜잭션 후 서버에서 기록되는 `lead_submit_success`만 사용한다.
- 실험 세션 계약 키는 `spacebogam_homepage_headline_v1_variant`다.
- 브라우저 지원 시 UUID fallback과 50:50 배정 모두 `crypto.getRandomValues`를 사용한다.

## 전역 A 롤백

`assets/site-tracking.js`의 단일 플래그를 아래처럼 바꾸고 같은 파일만 배포한다.

```diff
- var GLOBAL_EXPERIMENT_VARIANT = '';
+ var GLOBAL_EXPERIMENT_VARIANT = 'A';
```

이 플래그는 URL 강제값, 로컬 강제값, 기존 세션 배정보다 우선하며, 동적으로 로드되는
`assets/funnel-tracking.js`에도 전달된다. 따라서 캐시가 갱신된 모든 트래픽은 A로 귀속된다.

운영 반영은 공개 변경이므로 CEO가 정확한 커밋을 승인한 뒤 기존 홈페이지 배포 절차로 진행한다.

## 검증

```bash
node --test tests/cmp98-funnel-tracking.test.js
```

검증 항목:

1. 임의 성공 쿼리 5종에서 `consultation_submit` 0건
2. 임의 성공 URL 새로고침에서 `consultation_submit` 누적 0건
3. 계약 키 저장 및 구 키 미사용
4. UUID와 배정의 `crypto.getRandomValues` 사용
5. 전역 A가 쿼리·로컬 강제·세션 B보다 우선
6. 정적 번들에 URL 성공 판정기와 제출 이벤트 송신기 부재

## 제한 및 후속 QA

- 이 변경은 개인정보나 상담 본문을 읽거나 저장하지 않는다.
- 승인된 비식별 A/B 실제 저장 각 1건의 서버 `lead_submit_success`와 동일 세션 귀속은 운영 반영 후
  QA가 수행해야 한다. 직접 연락처나 자유 입력 상담 내용은 증거에 포함하지 않는다.
- URL `experiment_id`/`experiment_variant`는 INTM 상담 링크까지 전달된다. 서버 측 저장 이벤트의
  명시적 실험 필드 계약을 바꾸려면 INTM 변경 권한이 별도로 필요하다.
