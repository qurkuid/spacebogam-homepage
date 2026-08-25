# spacebogam.kr 웹 저위험 변경 자동 승인·배포 가드레일 (CMP-1436, 설계안)

> **상태: 설계 + dry-run 검증까지만 완료. 자동 승인은 아직 비활성.**
> 이 문서가 Board 승인을 받아도 실제 자동 배포는 켜지지 않는다. 켜려면 별도의
> 활성화 승인 카드(§8)를 통과해야 한다. CMP-213(상담 CTA 직결·태그 지연)은
> 이 정책이 확정될 때까지 보류 상태를 유지한다 — §6의 replay 결과가 그 판단이
> 옳았음을 확인해 준다.

## 1. 배경

spacebogam.kr 은 사람이 검토하는 카드 방식으로 배포를 승인한다. 문제는 "태그
로딩 시점만 옮기는" 것처럼 반복적이고 근거가 뚜렷한 성능 개선까지 매번 같은
카드에서 멈춘다는 것이다 (예: CMP-1369). 이 문서는 **그런 변경만** 사람 승인
없이 진행되도록, 진짜 위험한 변경은 지금처럼 반드시 사람이 보게 하는 경계선을
diff 기반으로 정의한다.

## 2. 스코프 — 이슈 원문 그대로 고정

**자동 진행 허용 후보**
1. 기존 태그·기능을 제거하지 않는 성능 최적화
2. 공개 문구·CTA 목적지·폼 필드·가격·광고 예산/타겟·추적 ID·전환 정의를 변경하지 않음
3. 테스트 신규 실패 0건, 필수 회귀 PASS
4. 배포 전 버전 고정과 1명령 롤백 준비
5. 배포 후 실URL probe, LCP/오류율/핵심 이벤트 read-back 자동 판정
6. 가드레일 실패 시 자동 롤백·blocked 전환·대표 보고

**반드시 사람 승인 유지**
- 광고 예산/입찰/타겟/소재 변경
- 공개 문구·CTA 목적지·폼 스키마·가격 변경
- 개인정보·결제·운영 DB 마이그레이션
- 분석 이벤트 의미/전환 정의 변경
- 신규 외부 서비스·시크릿·권한 추가

## 3. 위험 분류기 — 기본값은 항상 "사람 승인"

`scripts/qa/lib/risk-classifier.mjs` (이 PR 포함, dry-run 전용 — 배포/롤백 명령을
전혀 호출하지 않는다). 두 git ref 사이의 변경 파일을 하나씩 검사해 **전부**
AUTO_ELIGIBLE 일 때만 커밋 전체를 AUTO_ELIGIBLE 로 판정한다. 하나라도 애매하면
그 커밋 전체가 HUMAN_REQUIRED 다 (default-deny).

파일 하나에 대한 판정 순서:

| 순서 | 검사 | 걸리면 |
|---|---|---|
| 1 | 파일 삭제 | 항상 HUMAN_REQUIRED |
| 2 | `preview-v8.css` 등 전환 퍼널 스타일 | 항상 HUMAN_REQUIRED (레이아웃이 폼/CTA 를 바꿀 수 있음) |
| 3 | HTML 가시 텍스트(스크립트/스타일/주석 제외) 비교 | 다르면 `PUBLIC_COPY_CHANGED` |
| 4 | `<input>/<select>/<textarea> name=` 지문 비교 | 다르면 `FORM_FIELD_CHANGED` |
| 5 | `href=`/`action=`/`tel:` 지문 비교 | 다르면 `CTA_DESTINATION_CHANGED` |
| 6 | `숫자+원/만원` 지문 비교 | 다르면 `PRICE_CHANGED` |
| 7 | GTM/GA/UA/AW/Pixel/네이버 WCS ID 지문 비교 | 다르면 `TRACKING_ID_CHANGED` |
| 8 | 위를 전부 통과 + 인프라 경로(`scripts/qa/`,`tests/`,`tools/`,`.githooks/`,`docs/`,루트 `*.md`) | `NON_PRODUCTION_INFRA` → AUTO |
| 9 | 위를 전부 통과 + 내용 무변화 | `NO_OP_OR_ASSET` → AUTO |
| 10 | 위를 전부 통과 + 코드 diff가 "안전 패턴"(§3.1) | `PERFORMANCE_TAG_TIMING` → AUTO |
| 11 | 그 외 전부 | `UNCLASSIFIED_CHANGE` → HUMAN_REQUIRED |

### 3.1 "안전 패턴" 코드 diff 란

지문(3~7)이 전부 동일해도, 새로 추가된 코드 줄에 다음 중 하나라도 있으면 그
파일은 안전 패턴이 아니다:
- 한글 문자열 (주석은 제외하고 검사 — 사람이 읽는 문구가 코드에 섞여 들어오는 경로 차단)
- 기존 파일에 없던 새 문자열 리터럴 (표준 DOM 이벤트 이름 6개는 예외)
- `location.replace/href/assign`, `.search`, `.hash`, `fetch(`, `XMLHttpRequest`,
  `sendBeacon`, `utm_`, `vertical`, `dataLayer.push` — **리터럴을 안 바꿔도
  귀속·이동·전송 대상을 바꿀 수 있는 API.** (8c2024f 실측에서 이걸 놓쳐 오탐이
  났고, 위 규칙으로 막았다 — §6 참조)

이 좁은 허용 폭은 실제로는 CMP-1369 류의 "태그 로드 지연 큐" 패턴 정도만
통과시킨다. 의도한 설계다 — 넓히는 건 항상 사람이 검토한 뒤 규칙을 고쳐서
하는 것이지, 분류기가 알아서 넓게 판단하게 두지 않는다.

## 4. 증거 패키지 스키마

`evidence-package.schema.json` (이 PR 포함). 배포 시도 1건마다 이 스키마를
채운 JSON 하나를 audit 로그에 남긴다. dry-run 모드에서는 `classifier` 까지만
채워지고 `deploy`/`postDeployVerify`/`rollback` 은 비어 있다 — 무엇이 실행됐고
무엇이 실행되지 않았는지 스키마 자체로 구분된다.

## 5. 배포/검증/롤백 상태 머신

라이브 배포는 이미 `/Volumes/DATABASE/spacebogam/bin/{preflight,deploy,rollback}.sh`
가 맡고 있다 (RUNBOOK.md, CMP-142/CMP-661). **이 정책은 그 위에 분류 게이트와
비즈니스 지표 검증을 추가하는 것이지 배포 메커니즘을 새로 만드는 게 아니다.**

```
RECEIVED
  -> CLASSIFYING            (risk-classifier.mjs, dry-run)
  -> HUMAN_REVIEW_REQUIRED  [분류기가 HUMAN_REQUIRED — 여기서 자동화 종료, 기존 카드 방식]
  -> AUTO_APPROVED          [분류기가 AUTO_ELIGIBLE]
  -> PRE_DEPLOY_GATE        (tests/harness.sh 신규 실패 0 + 필수 회귀 PASS,
                             bin/preflight.sh exit 0)
  -> GATE_FAILED            [실패 시 여기서 종료 — 배포 자체를 시도하지 않음]
  -> VERSION_PINNED         (bin/deploy.sh 가 이미 하는 일: releases/<sha> 추출,
                             직전 릴리스 sha 기록 — "1명령 롤백"의 전제)
  -> DEPLOYED               (bin/deploy.sh: current 심볼릭 링크 교체 +
                             바이트 단위 verify_release())
  -> POST_DEPLOY_VERIFY     (신규: 실URL probe로 LCP/JS 오류율/핵심 이벤트
                             read-back — 바이트 일치를 넘어 사용자 체감·계측
                             생존까지 확인. cmp208-landing-form-probe.mjs 류
                             재사용)
  -> VERIFIED_OK -> DONE
  -> VERIFY_FAILED -> AUTO_ROLLBACK (bin/rollback.sh, 이미 존재하는 즉시 롤백)
                    -> ROLLED_BACK -> BLOCKED (대표 보고, 원인 미해결 상태로 남김)
```

## 6. Replay 결과 — 최근 실제 커밋 7건

`spacebogam-homepage` git 로그에서 배경이 다른 사례를 골라 분류기를 실행했다
(dry-run — 실제 배포/롤백 없음. 재현: `node scripts/qa/lib/risk-classifier.mjs <sha>~1 <sha>`).

| 커밋 | 내용 | 판정 | 근거 |
|---|---|---|---|
| `197d888` | CMP-1369: 광고 랜딩 4곳 GTM/gtag 로드를 첫 입력 뒤로 지연 | **AUTO_ELIGIBLE** | 태그 제거 없음, 공개 문구·CTA·폼·가격·추적ID 지문 불변, 안전 패턴(§3.1) 일치 |
| `49e6fde` | CMP-1341: pre-commit 훅을 `.githooks/`에 커밋, README 안내 추가 | **AUTO_ELIGIBLE** | 공개 서비스 표면을 전혀 건드리지 않는 인프라 변경 |
| `ccae1c0` | CMP-1369: 상담 신청서 필수 항목 11→4 | **HUMAN_REQUIRED** | 폼 필드 구성 변경 — "폼 필드" 제외 항목 |
| `8c2024f` | CMP-1340: 디렉터리형 리다이렉트 40개 UTM/해시 유실 수정 | **HUMAN_REQUIRED** | UTM 전달 로직(`location.search`/`.hash` 병합) 변경 — 분류기가 리터럴 재사용만으로는 못 잡았던 케이스, §3.1 규칙 추가로 확정 HUMAN 처리 |
| `ee4ae56` | 광고 소재 라벨에서 업종(vertical) 파싱 로직 수정 | **HUMAN_REQUIRED** | `phone_click` 이벤트의 vertical 귀속 방식을 바꿈 — "전환 정의" 변경에 해당 |
| `08abea0` | 전화 상담 번호를 0507-1388-1252 → 1551-0163 로 교체 | **HUMAN_REQUIRED** | 공개 연락처(문구) 변경 — CTA 성격의 실제 목적지 변경 |
| `77f76d5` | 상담 페이지 전화 암시 문구 중립화 | **HUMAN_REQUIRED** | 공개 문구 변경 |

**7건 중 2건 AUTO, 5건 HUMAN.** 자동 진행 후보로 설계 의도한 "태그 지연"과
"내부 인프라"만 통과했고, 겉보기엔 사소해 보이는 버그 수정(`8c2024f`,
`ee4ae56`)까지 정확히 사람 승인으로 걸러졌다 — 이 두 건은 오탐 방지 규칙을
추가하게 만든 실제 사례다.

**CMP-213 참고:** CMP-213 은 상담 CTA 를 `/consultation/` 경유 없이 폼에 직결하는
작업이다. CTA 클릭 시 이동하는 목적지 자체가 바뀌므로 위 표의 `CTA_DESTINATION_CHANGED`
규칙(§3, 순서 5)에 해당해 이 정책 하에서도 **HUMAN_REQUIRED** 로 남는다. 정책이
확정돼도 CMP-213 은 자동 진행 대상이 아니다 — 사람 승인을 받아 별도로 진행하면 된다.

## 7. 감사 로그 · 중복 실행 방지 · 동시 배포 잠금

- **감사 로그**: 기존 `/Volumes/DATABASE/spacebogam/deploy.log` 는 사람이 읽는
  텍스트 로그다. 자동 승인 파이프라인은 시도 1건마다 §4 스키마의 JSON 레코드를
  별도 append-only 로그(`decisions.ndjson`)에 남긴다 — 어떤 커밋이 왜
  AUTO/HUMAN 으로 갈렸는지 사후 추적 가능해야 한다.
- **중복 실행 방지**: 레코드 키는 `commitSha`. 같은 sha 에 대해 이미
  완료(`DONE`/`BLOCKED`) 레코드가 있으면 재실행하지 않고 기존 레코드를 반환한다.
- **동시 배포 잠금**: 현재 `bin/deploy.sh` 에는 락이 없다 (확인됨 — 이번 설계에서
  발견한 실제 공백). 기존 스크립트를 고치지 않고, 자동 승인 오케스트레이터가
  `flock -n $ROOT/.auto-deploy.lock` 로 감싸 호출하는 방식을 제안한다. 락을 못
  잡으면 그 시도는 `BLOCKED`(사유: 동시 배포 진행 중)로 즉시 종료 — 대기시키지
  않는다.

## 8. 활성화 전 남은 절차

이 이슈는 여기까지다. 실제로 사람 승인 없이 배포가 나가려면 아래를 **전부**
거쳐야 한다:
1. 이 설계 문서에 대한 Board 승인 (이번 이슈의 승인 카드)
2. 파일럿 기간: 분류기를 실제 신규 커밋에 shadow 모드로만 돌려(배포에 영향 없음)
   AUTO_ELIGIBLE 판정이 나온 케이스를 사람이 그대로 재검토 — 오탐(진짜 위험한
   걸 AUTO 로 냄) 0건 확인
3. §7 의 잠금/중복방지 오케스트레이터 실제 구현 + preflight/rollback 드릴 재검증
4. **활성화 자체를 승인하는 별도 Board 카드** — 이번 카드와는 다른 카드다.

## 부록: 이 설계의 산출물

- `scripts/qa/lib/risk-classifier.mjs` — 분류기 (dry-run, 배포/롤백 호출 없음)
- `evidence-package.schema.json` — 증거 패키지 스키마
- 이 문서 — 정책, 상태 머신, replay 결과
