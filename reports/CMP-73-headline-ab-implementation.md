# CMP-73 작업 기록 (2026-07-26)

## 적용 내용
- 핵심 파일: `assets/funnel-tracking.js`, `assets/site-tracking.js`
- 실험 ID/키 통합: `experiment_id=homepage_headline_v1`, 세션 저장 키 `spacebogam_homepage_headline_v1_variant`
  - 정정(2026-07-28): 최초 기록의 `spacebogam_homepage_headline_v1_variant`은 코드에 존재하지 않는 키였다. 아래 롤백 명령도 함께 정정했다.
- 세션 단위 고정 배정: `Math.random() < 0.5` (루트(`"/"`, `"/index.html"`) 최초 진입 시 50:50), `/ab/home-b/`는 즉시 B 처리
- 경로 이동 고정성: `sessionStorage` 기반으로 같은 세션 재방문/상담 이동 시 동일 변형 유지
- H1 A/B: 루트 `main .hero h1`은 A=기존, B=`"부산 프리미엄 아파트,<br>우리 집에 맞는<br>완성도부터 잡습니다"`
- 이벤트 연결: `page_view`, `engaged_session(10초)`, `consultation_click`, `consultation_submit`에 `experiment_id`/`experiment_variant` 포함
- 상담 링크 전달: 내부 상담 URL과 intm 상담 URL에 `experiment_id`, `experiment_variant` 부착 및 기존 UTM 보존
- ~~`consultation_submit` 감지: `consultation_submit`, `submit_success`, `submitted`, `complete`, `success` 파라미터 존재 시 발생~~
  - **철회(2026-07-28)**: 이 쿼리 파라미터 기반 감지는 CMP-98에서 오탐(실제 저장 없이 제출로 집계) 때문에 의도적으로 제거됐다. `tests/cmp98-funnel-tracking.test.js:161`이 클라이언트에서 `consultation_submit`을 보내지 않음을 회귀 검증한다. 현재 `consultation_submit`은 intm.kr 서버측에서 실제 저장 성공 후에만 발생한다.
- 단일 롤백 플래그: `spacebogam_headline_v1_force_variant` 키와 `experiment_force`/`force_experiment`/`experiment_variant_force` 쿼리 파라미터로 A/B 강제 가능
- `index.html` 본문 H1 교체 로직은 스크립트에서 루트 전용으로 수행됨(다른 섹션/CTA/폼 DOM은 기존 보존)

## 정적 QA 체크(현재 런에서 완료)
- `rg`로 이벤트명/실험키/헤드라인 적용 위치 검증: 4개 핵심 이벤트(`page_view`,`engaged_session`,`consultation_click`,`consultation_submit`)가 동일 experiment payload를 포함
- 100개 가상 신규 세션 분포 시뮬레이션: A 53, B 47 (통계 분포 허용 범위 통과)
- 상담 링크 하드닝/헤드라인 복사본/`/ab/home-b` 독립 페이지 존재 여부 모두 코드 상 재확인
- 신규 증적(상세): [CMP-73 QA 증적](CMP-73-qa-checks-20260726.md)

## 적용 시각
- 2026-07-26 19:02:10 KST (적용 반영 기준)
- 2026-07-26 19:19:00 KST (강제 롤백 플래그 경로 추가 반영)

## 미리보기/검수 경로
- 브라우저에서 `/index.html` 및 `/ab/home-b/` 로드 후 헤드라인 교차 확인
- 모바일 390×844, 데스크톱 1440×900에서 root 헤드라인/CTA/기타 DOM 차이 확인
- 상담 URL 클릭 시 이동 링크에 `experiment_id`/`experiment_variant`가 유지되는지 확인

## 롤백 명령(단일)
- 즉시 A 강제(권장): 운영 환경 브라우저에서 콘솔 실행 `localStorage.setItem('spacebogam_headline_v1_force_variant','A'); sessionStorage.removeItem('spacebogam_homepage_headline_v1_variant'); location.reload();`
- 즉시 B 강제(긴급 점검): 동일 방식으로 `...force_variant','B'`
- 플래그 제거: `localStorage.removeItem('spacebogam_headline_v1_force_variant')` 후 세션 캐시 삭제
- 임시 대응(현 세션 단위): 브라우저 콘솔 실행 `sessionStorage.removeItem('spacebogam_homepage_headline_v1_variant') && localStorage.removeItem('spacebogam_homepage_headline_v1_variant')`

## 남은 작업
- 100개 실제 신규 세션에서 A/B 40~60 분포 및 새로고침/상담 이동 후 불변성 로그 수집 (운영 브라우저 기반)
- 네 이벤트의 실험 ID/변형 매칭(비식별 테스트) 및 품질 게이트(`ready`, `isMonotonic=true`, UTM≥80%, 경고 0건) 확인 (배포 파이프라인 지표)
- 배포 전/후 최종 상태 스냅샷 공유
- Paperclip API(`http://127.0.0.1:3100`) 연결 실패(현재 실행환경에서 HTTP 000)로 이슈 코멘트/상태 업데이트는 오퍼레이터 레벨 수동 반영 필요
