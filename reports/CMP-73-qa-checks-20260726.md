## CMP-73 QA 증적 (2026-07-26)

### 1) 100세션 시뮬레이션
- 난수 기반 분배(세션 단위 고정 로직 재현): `A=53`, `B=47`
- 승인 범위 통과: `A/B` 모두 `40~60`

### 2) 세션 고정성(논리 검증)
- `sessionStorage` 키: `spacebogam_funnel_experiment_homepage_headline_v1`
- `isHomepage` 최초 진입에서 `A/B` 할당 후 `sessionStorage` 보존 구조 존재
- 강제 파라미터/로컬 강제 키 존재 (`experiment_force`, `force_experiment`, `experiment_variant_force`, `spacebogam_headline_v1_force_variant`)
- 동일 세션 내 root 리로드/`/consultation/` 이동 후 동일 변형 유지 요건은 스크립트 구조상 충족 근거 확보

### 3) 이벤트 페이로드 정합성
- `send` 호출 이벤트 모두 존재: `page_view`, `engaged_session`, `consultation_click`, `consultation_submit`
- 페이로드 키에 `experiment_id`/`experiment_variant`(동일 키명 및 camelCase 보조 키 포함) 존재
- 제출 신호 감지 경로: `consultation_submit|submit_success|submitted|complete|success`

### 4) CTA/UTM 보존 정합성
- `index.html` root, `ab/home-b` 모두 `site-tracking.js` 로딩으로 URL 데코레이션/클릭 트래킹 진입점 확보
- 상담 링크 후보가 코드상 0~여러 개 존재
- decorate 로직에 `utm_*`와 `experiment_id`, `experiment_variant`, `sbClientId`, `sbSessionId` 세팅 분기 존재

### 5) DOM/헤드라인 범위
- Root A 텍스트: `공간은\n사가...` 그대로
- B 헤드라인: `부산 프리미엄 아파트, 우리 집에 맞는 완성도부터 잡습니다`
- 루트는 `applyHomeHeadline()`에서 `main .hero h1`만 교체

### 6) 참고: 접근 제한
- Paperclip API(`http://127.0.0.1:3100`)이 현재 네트워크/서비스 미가동으로 000 응답
- 품질 게이트(`ready`, `isMonotonic=true`, `UTM>=80%`, warning) 수집은 배포 파이프라인 측 수치로 이어서 갱신 예정
