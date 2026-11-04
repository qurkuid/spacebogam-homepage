# 고객 후기 운영

공개 주소: https://spacebogam.kr/reviews/

고객이 작성한 후기는 바로 공개되지 않는다. 고객 여부와 개인정보를 확인한 후 공개하며, 낮은 별점에도 동일한 기준을 적용한다. 내용을 고쳐서 승인하지 않는다. 수정이 필요하면 고객에게 확인하고 다시 접수받는다.

## 접수 확인·공개·삭제

운영 서버 전용 명령이다. 홈페이지에 관리자 API나 비밀번호를 만들지 않았다.

```sh
ssh macmini
cd /Users/baegchangseog/srv/spacebogam-site
node spacebogam-reviews.js list
node spacebogam-reviews.js show 후기UUID
node spacebogam-reviews.js approve 후기UUID --customer 내부고객코드
node spacebogam-reviews.js reject 후기UUID
node spacebogam-reviews.js delete 후기UUID
```

`--customer`에는 실명·연락처·상세 주소 대신 내부의 안정적인 고객 코드를 쓴다. 같은 고객의 여러 후기에는 같은 코드를 사용해야 고객 수가 중복되지 않는다. 이미 공개한 후기를 다른 고객으로 바꿔 재승인할 수 없다. 고객 코드와 동의 증거는 공개 API나 페이지에 포함하지 않는다.

`show`로 본문을 읽고 고객 기록과 확인한 뒤 승인한다. 접수번호는 고객에게 표시되므로 전화 확인 시 사용할 수 있다. 검증되지 않은 경험, 개인정보가 들어간 글, 스팸은 공개하지 않는다. `reject`는 비공개 보관, `delete`는 원본 삭제다. 삭제 요청·공개 동의 철회에는 `delete`를 사용한다. 삭제는 목록·통계·상세 주소·후기 사이트맵에 즉시 반영되며, 검색엔진 사본의 반영 시점은 별개다.

## 저장·제한

- 기본 저장: `/Users/baegchangseog/srv/spacebogam-site/private/reviews.json`. 공개 `current` 및 `releases` 밖에 보관한다. 디렉터리 0700, 파일 0600.
- `ROOT`, `REVIEWS_FILE`, `REVIEWS_PUBLIC_ORIGIN`으로 실행 환경을 지정할 수 있다. 공개 루트 안으로 저장소를 지정하면 시작을 거부한다.
- 공개 폼과 서버가 `reviews-2026-11-04` 동의 버전을 함께 확인하고 동의 일시를 저장한다. 안내 내용 변경 시 양쪽 버전도 함께 바꾼다.
- 한 접속자당 시간당 5회. `TRUSTED_REVIEW_PROXY`는 즉시 연결 프록시 주소를 쉼표로 지정한다. 해당 주소에서 온 요청의 유효한 `CF-Connecting-IP`만 신뢰한다. 운영은 Cloudflare → nginx → loopback Node 경로다. 다른 노출 경로로 바뀌면 먼저 이 신뢰 설정을 재검토한다.
- JSON 전체 읽기 방식이다. 일반적인 소규모 후기 게시판을 대상으로 하며 데이터가 커져 읽기·쓰기가 느려질 때 DB로 이전한다.
- 요청 키는 접수 재시도 중복을 방지한다. 재시도에 같은 키·다른 본문을 보내면 409다.
- JSON 손상·쓰기 잠금 충돌은 503으로 차단한다. 손상 파일을 덮어쓰지 않는다. 비정상 종료로 `.lock`이 남았다면 쓰기 프로세스가 없는지 확인한 뒤 해당 잠금만 제거한다. 원본 JSON은 지우지 않는다.
- 릴리스 전환이나 되돌리기 때 private 저장소를 복사·초기화·삭제하지 않는다. 호스트 디스크 손실까지 복구하는 외부 백업 서비스는 추가하지 않았다.

## 검색·통계·색인

`/api/reviews`와 서버 렌더링 `/reviews/`는 공개된 후기만 읽는다. 검색어, 1~5점 필터, 공간 유형, 최신순·높은 평점순·낮은 평점순, 페이지당 6개를 지원한다. 통계는 검색 조건과 무관하게 전체 공개 후기 기준이다. 고객 수는 승인 시 연결한 고객 코드의 중복을 제외한다.

공개 후기는 `/reviews/후기UUID/`에서 자바스크립트 없이도 읽힌다. `/reviews/sitemap.xml`은 공개된 개별 주소를 자동 반영하고 `robots.txt`에서 안내한다. 별점 검색 결과 노출이나 실제 검색엔진 색인은 보장하지 않는다.

## 검증

```sh
node --test tests/reviews.test.js tests/spacebogam-serve.test.js tests/seo-content.test.js
/Applications/ChatGPT.app/Contents/Resources/cua_node/bin/node tests/reviews-browser.mjs
```

브라우저 검증은 격리된 임시 저장소에만 후기를 만들고 종료 시 삭제한다. 실제 고객 후기·운영 접수는 생성하지 않는다. 기존 정적 서버·상담 프록시 회귀와 360/390/768/1440px 화면을 함께 확인한다.
