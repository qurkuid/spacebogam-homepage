# CMP-173 — spacebogam.kr 상담 신청 페이지 (intm API 직접 호출)

대표 지시(CMP-151): "공간보감 페이지에, intm의 api만 활용해서 상담신청 페이지를 새롭게 만들고 필요한 추적코드를 넣을것."

## 만든 것

- `/consultation/apply/` — 공간보감 도메인 안에서 제출까지 끝나는 상담 신청 페이지. UI 는 공간보감이 소유하고, 질문 목록과 제출만 intm API 를 쓴다.
- `assets/consultation-form.js` — 폼 렌더 + 계측.
- `assets/site-tracking.js`, `assets/funnel-tracking.js` — 신규 경로를 상담 링크로 인식하도록 확장.

`intm.kr/consultation/ggbg` 로 넘기던 2-도메인 리다이렉트가 이 경로에서는 사라진다.

## intm API 계약 (임의로 바꾸지 말 것)

| 항목 | 값 |
|---|---|
| 질문 조회 | `GET https://intm.kr/api/consultation/questions` (미인증 = 공간보감 질문) |
| 제출 | `POST https://intm.kr/api/consultation/submit` |
| `companyId` | `4206bdfd-b51d-4433-9f8e-c854131948cc` — **UUID 다. 슬러그 `ggbg` 를 보내면 500** |
| 본문 | `{ answers, filePath, companyId, marketingAttribution }` |
| `answers` | 질문 id 문자열 키 → 문자열 값. 복수선택은 `', '` 결합 |
| 개인정보 동의 | `answers["9999"] = "true"` (질문 테이블에 없는 고정 id) |
| 성공 | HTTP 201 `{ success: true, consultReqId, leadEventId, ... }` |

서버에는 **필수값 검증이 사실상 없다.** 필수 항목 검사는 전적으로 클라이언트 책임이다.

## 계측 계약

CMP-151·CMP-156 에서 굳은 것을 그대로 재사용한다. 새로 설계하지 않았다.

- **플랫폼 식별자 5종** `utm_id`/`campaign_id`/`adset_id`/`ad_id`/`asset_id` 를 `marketingAttribution` 에 그대로 싣는다. localStorage 스냅샷은 UTM 만 보관하므로, 랜딩→폼 이동에서 이 값들을 잃지 않으려면 `site-tracking.js` 의 링크 릴레이가 신규 경로를 인식해야 한다. 그래서 `LOCAL_CONSULTATION_PATHS` 에 `/consultation/apply/` 를 넣었다.
- **event_id 공유** — 클라이언트가 뽑은 UUID 를 `sbSubmitEventId` 로 보내면 서버가 그대로 `lead_event_id` 로 쓰고 `leadEventId` 로 되돌려준다. Pixel `Lead` 의 `eventID` 에 그 값을 넣어 브라우저·서버가 같은 건을 가리키게 한다.
- **`is_test`** — URL 의 `1/true/yes/y/on` 을 서버가 기대하는 `'true'` / `''` 로 좁혀 보낸다. QA 유입이 실적으로 집계되지 않게 하는 유일한 장치다.
- **`sbClientId` / `sbSessionId`** 는 `funnel-tracking.js` 와 **같은 저장소 키**(`spacebogam_funnel_client_id` / `spacebogam_funnel_session_id`)에서 읽는다. 새로 뽑으면 클릭 이벤트와 상담 건이 이어지지 않는다(CMP-160).
- **퍼널 lead 단계 event_id 는 세션 고정.** 특히 `lead_submit_success` 의 `eventId` 는 `sbSubmitEventId` 와 같아야 한다 — 서버 `recordSubmittedLead` 가 같은 id 로 이미 한 행을 쓰기 때문에, 다르면 `ON CONFLICT` 에 걸리지 않고 lead 단계가 2배로 잡힌다.
- 퍼널 이벤트 스키마는 `.strict()` 다. snake_case 별칭을 섞으면 전량 400 이 된다(CMP-141).

## intm.kr 쪽 선행 변경

`intm` PR #19 — `consultation/submit` 과 `consultation/questions` 에 CORS + `OPTIONS` 추가. **이게 배포되기 전에는 이 페이지가 동작하지 않는다.** 브라우저가 preflight 에서 막힌다.

## 기존 `intm.kr/consultation/ggbg` 링크 처리 방침

**유지한다. 폐기하지 않는다.**

- 광고 소재, 네이버 블로그 본문, 인스타 프로필, 북마크에 이미 뿌려진 링크다. 끊으면 집행 중인 유입이 그대로 증발한다.
- 해당 경로는 CMP-156 에서 허용목록·Pixel dataset 주입을 고쳐 귀속이 정상 동작한다. 살아 있어도 계측이 새지 않는다.
- 신규 페이지가 실패할 때의 대피로이기도 하다. 질문 로딩 실패·자바스크립트 비활성 시 이 링크로 안내한다.

전환 순서:

1. intm PR #19 배포 → 라이브 CORS 확인
2. 이 페이지 배포 → 승인된 테스트 건 1회로 접수·CRM·Pixel 대조
3. 그 후에 사이트 내부 CTA 를 `/consultation/apply/` 로 교체 (별도 작업)
4. 광고 소재 링크 교체는 대표 결정 사항 — 집행 시점과 묶여 있어 이 이슈 범위가 아니다

`/consultation/apply/` 는 `noindex,follow` 다. 안내 페이지 `/consultation/` 과 중복 색인되면 검색 유입이 갈린다.

## 검증

`node --test tests/cmp173-consultation-apply-form.test.js` — 12/12 통과 (jsdom 필요, `NODE_PATH` 로 지정).

렌더링·필수값 검증·제출 payload·Pixel event_id 일치·퍼널 이벤트 순서와 dedup·실패 처리를 제출 요청을 가로채 검사한다. **실제 제출은 하지 않는다** — intm 상담 제출은 성공 시 고객에게 알림톡을 실발송한다.

기존 회귀: `tests/cmp151-cta-attribution-relay.test.js`, `tests/cmp98-funnel-tracking.test.js` 12/12 통과.

## 남은 위험

- 주소 입력이 우편번호 검색 없는 자유 입력이다. intm 폼은 주소 검색 위젯을 쓴다. 접수는 되지만 주소 품질이 떨어질 수 있다.
- 파일 업로드(도면·현장 사진)를 넣지 않았다. `/api/consultation/upload` 에는 CORS 를 열지 않았다. 필요하면 후속 작업.
- intm 폼이 `시공 희망`·`예산` 을 포함한 질문을 강제 필수로 올리는 휴리스틱을 쓰는데, 여기서는 따르지 않았다. 서버 검증이 없어 접수에는 문제가 없고, 마찰을 줄이는 쪽을 택했다. 예산 구간(`21`)은 원래 필수라 그대로 필수다.
