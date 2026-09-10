# CMP-973 G4 전환·계측 검증

## 1. 배경

기존 비공개 시안은 상세 이미지가 1장뿐이고 관련 콘텐츠·전화·상담 경로·UTM 및 행동 이벤트가 없어 전환 QA에서 반려됐다.

## 2. 실행

- 상세 4개에 2~4장 갤러리, 관련 글, 전화, 상담 신청 경로를 연결했다.
- 포트폴리오 보기, 상세 보기, 갤러리 보기·열기, 관련 글, 전화, 상담 시작을 익명 `dataLayer` 이벤트로 분리했다.
- 최초 UTM을 기존 사이트 저장 키에 보존하고 내부 링크에는 UTM을 다시 붙이지 않았다.
- 실제 리드는 기존 공용 상담 폼이 서버 성공 응답을 받은 뒤 발생시키는 `lead_submit_success`만 사용한다.
- 광고·SNS·웹 매핑은 `g4-private/CAMPAIGN-MAP.md`에 고정했다.

## 3. 결과

- Node 계약·회귀 테스트: 23/23 통과.
- 390×844 실제 브라우저 테스트 트래픽: 홈 2개 이벤트, 상세 6개 이벤트가 각각 1회 발화.
- 재현 URL: `g4-private/index.html?utm_source=meta&utm_medium=paid_social&utm_campaign=g4_case_proof_paid&utm_content=case_proof_static_v1&is_test=1`
- 홈: `portfolio_view`, `portfolio_project_open` 각 1회.
- 상세: `case_detail_view`, `case_gallery_view`, `case_gallery_open`, `case_related_story_open`, `phone_click`, `consultation_click` 각 1회.
- 최초 `utm_campaign=g4_case_proof_paid`, `creative_id=case_proof_static_v1`, `is_test=true`가 내부 이동 후 유지됐다.
- 이벤트 개인정보 키 0개, 로컬 자산·링크 누락 0개, 브라우저 요청 실패 0개.

## 4. 판단

전화 클릭은 통화 시도일 뿐 리드가 아니다. 리드는 상담 API 성공 뒤에만 기록하는 현재 분리를 유지하는 것이 안전하다. 운영 배포·광고 적용은 하지 않았다.

## 5. 다음 연결

독립 QA에서 같은 테스트 URL로 이벤트 1회 발화, 최초 UTM 유지, 제출 성공/실패 분리를 재검수한다. 통과 후 전략·성과 책임자가 운영 반영 여부를 별도 결재한다.
