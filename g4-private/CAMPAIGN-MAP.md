# G4 비공개 채널 매핑

| 채널 | creative | promise | landing | CTA | `utm_campaign` |
| --- | --- | --- | --- | --- | --- |
| Meta 광고 | `case_proof_static_v1` | `living_before_decoration` | `g4_private_home` | `view_case` | `g4_case_proof_paid` |
| Instagram SNS | `case_story_carousel_v1` | `living_before_decoration` | `g4_private_home` | `view_case` | `g4_case_story_social` |
| 웹 내부 | `g4_editorial_web_v1` | `living_before_decoration` | `g4_private_home` | `view_case` | `g4_web_navigation` |

검증 URL 예시: `index.html?utm_source=qa&utm_medium=verification&utm_campaign=g4_case_proof_paid&utm_content=case_proof_static_v1&is_test=1`

- 최초 UTM은 기존 사이트 키 `spacebogam_funnel_attribution`에 30일간 보존하며 새 내부 이동으로 덮지 않는다.
- 내부 링크에는 UTM을 다시 붙이지 않는다. 상담 링크에서 기존 공용 계측기가 최초 UTM과 익명 세션 ID만 전달한다.
- `phone_click`은 통화 시도이며 리드가 아니다. 실제 제출은 공용 상담 폼의 API 성공 뒤 `lead_submit_success`로만 기록한다.
- 이벤트에는 이름·전화번호·주소·상담 내용·검색어 원문을 넣지 않는다.
