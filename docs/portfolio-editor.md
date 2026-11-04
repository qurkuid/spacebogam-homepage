# 홈페이지 포트폴리오 편집

관리: https://intm.kr/newportal/settings/homepage-portfolio
공개: https://spacebogam.kr/portfolio.html

INTM의 공간보감 회사 관리자로 로그인한다. 공개 목록의 `포트폴리오 관리`와 INTM 포트폴리오 메뉴에서 이동할 수 있다. 기존 사진 업로드·태그 관리는 INTM 포트폴리오의 기존 기능을 사용한다.

## 편집과 발행

현재 공개된 포트폴리오 목록과 그 목록에 연결된 현장 상세 HTML을 읽어 편집한다. 제목·검색 요약·본문·사진 설명을 바꿀 수 있다. 사진 원본 URL과 공개 주소는 유지한다. 목록의 면적·예산·태그·건수처럼 필터 데이터에서 계산되는 문구는 편집 대상에서 제외한다. 기존 사진 갤러리, 필터, 상담 링크와 추적 코드도 보존한다.

`초안 저장`은 INTM DB에만 저장한다. `미리보기`는 현재 편집 내용을 표시하며 검색엔진에 공개하지 않는다. 저장한 초안을 확인하고 `정적 발행`을 실행해야 홈페이지에 반영된다. 공개 HTML은 발행 시에만 생성되며, 방문자 요청에서 INTM DB/API나 Next.js 렌더링을 사용하지 않는다.

다른 편집자나 외부 배포가 먼저 내용을 변경하면 409로 중단한다. 편집 중인 내용을 확인한 후 최신 페이지를 다시 불러와 반영한다. 현재 운영 파일을 이전 저장소 버전으로 덮어쓰지 않는다.

## SEO·GEO 기본값

- 페이지별 제목·요약을 본문에 맞게 작성한다. 자동 채움도 실제 입력한 제목과 본문만 사용한다.
- canonical·OG·Twitter 정보를 고정된 공개 주소와 일치시킨다.
- 본문과 사진 설명은 자바스크립트 없이 HTML에서 읽힌다.
- 기존 구조화 데이터를 보이는 내용과 동기화한다. 확인되지 않은 시공 정보, 고객 후기·별점·FAQ를 만들지 않는다.
- 실질 변경을 발행할 때 수정일과 사이트맵의 해당 URL `lastmod`를 함께 반영한다. 알 수 없는 최초 발행일을 만들지 않는다.
- 기존 검색 크롤러·학습 봇 정책은 유지한다. 별도 GEO 전용 마크업이나 허용 변경이 필요하지 않다.

[Google AI 검색 지침](https://developers.google.com/search/docs/appearance/ai-features), [구조화 데이터 정책](https://developers.google.com/search/docs/appearance/structured-data/sd-policies), [이미지 검색 지침](https://developers.google.com/search/docs/appearance/google-images), [사이트맵 지침](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap)을 기준으로 한다. 발행·크롤링 가능성 확인은 검색 색인·순위·AI 인용 성공을 의미하지 않는다.

## 운영 설정

INTM 서버의 `SPACEBOGAM_SITE_ROOT`는 공개 파일이 들어 있는 `current` 링크와 `releases`를 포함하는 고정 사이트 루트다. 브라우저 요청으로 저장 경로를 지정하지 않는다. 운영은 `/Users/baegchangseog/srv/spacebogam-site`를 사용한다.

초안과 최근 발행 상태는 회사 범위의 INTM DB에 저장한다. 발행은 새 릴리스에 선택 페이지와 사이트맵만 반영한 뒤 `current` 링크를 원자적으로 바꾼다. 기존 후기, 상담 데이터, 관련 없는 정적 파일은 보존한다. 설정 누락·권한 오류·버전 충돌은 발행을 중단한다.
