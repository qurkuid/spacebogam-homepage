# 공간보감 Agency Agents 역할 기반 실행 · 1차 근거 감사
- 기준일: 2026-11-08 (Asia/Seoul)
- 상태: 비발행 검토 초안 (운영 홈페이지 수정 없음)
- 최종 목적: 부산 아파트 인테리어 업체를 추천하는 비브랜드 AI 질문에서 **공간보감의 실제 언급률 및 상위 3개 업체 내 등장률**을 높이고, 공개 근거를 통해 설득력 있게 소개되도록 한다.
- 작업 허브: [추천 점유율 #76](https://github.com/qurkuid/spacebogam-homepage/issues/76), [회사정보 정정 #78](https://github.com/qurkuid/spacebogam-homepage/issues/78).

## 1. 실제 원본 역할 채택
출처: [msitarzewski/agency-agents](https://github.com/msitarzewski/agency-agents). 이 문서는 공식 Agency Agents의 역할별 원본 지시문을 참고한 **업무 적용 가이드**다. 이 문서를 만들었다고 여러 독립 프로세스나 전용 Agency Agents 런타임이 기동된 것은 아니다.

| 순서 | Agency Agents 원본 역할 | 책임 | 통과 조건 |
|---|---|---|---|
| 리드 | [AI Citation Strategist](https://github.com/msitarzewski/agency-agents/blob/main/marketing/marketing-ai-citation-strategist.md) | ChatGPT/Claude/Gemini/Perplexity 등에서 추천 등장률·상위 3위·실제 출처 인용률 비교, 경쟁사에 밀린 질문 분석, 우선순위 수정 | 플랫폼별 실제 관측/미측정을 분리하고 날짜·질문·링크 제시 |
| 기반 검사 | [AEO Foundations Architect](https://github.com/msitarzewski/agency-agents/blob/main/marketing/marketing-aeo-foundations.md) | robots/sitemap/llms.txt 및 HTML의 접근·파싱 가능성, 실제 크롤링 확인 | 이미 구현한 기술 기반을 중복 추가하지 않고 실제 서버에서 검증 |
| 검색 실무 | [SEO Specialist](https://github.com/msitarzewski/agency-agents/blob/main/marketing/marketing-seo-specialist.md) | 검색 의도·지역/평형 페이지 구조, GSC 쿼리×페이지 간 키워드 잠식 감사 | 타이틀/H1/본문 편집 전 GSC 근거 또는 명시적 GSC 미접근 시 대체 URL 목록 검사 |
| 외부 신뢰 | [PR & Communications Manager](https://github.com/msitarzewski/agency-agents/blob/main/marketing/marketing-pr-communications-manager.md) | 외부 프로필 NAP(상호/주소/전화) 통일과 실제 편집 매체 정정·팩트시트 | 실제 수정 제출/승인/반영을 각각 증명, 허위 소개·무단 외부 발송 금지 |
| 최종 검증 | [Reality Checker](https://github.com/msitarzewski/agency-agents/blob/main/testing/testing-reality-checker.md) | 코드 완료와 실제 외부 반영을 구분; 근거 없는 성공 선언 차단 | 실제 URL·검색 결과·테스트 원본이 없는 완료표시는 보류 |

역할을 분담할 때는 AI Citation Strategist가 문제/성과 정의 → AEO/SEO/PR 각자의 근거수집 및 작업물 → Reality Checker의 재검증 → 리드가 우선순위 재설정 순서로 인수인계한다.

## 2. 1차 기술 기반 감사 (저장소 파일 기준)
| 항목 | 관찰 근거 | 판정/다음 조치 |
|---|---|---|
| robots.txt | [robots.txt](https://github.com/qurkuid/spacebogam-homepage/blob/main/robots.txt) `User-agent: * / Allow: /` | 저장소상 기본 허용 확인. **실서비스 로봇 응답/AI 크롤러 로그 미확인** |
| 사이트맵 | [sitemap.xml](https://spacebogam.kr/sitemap.xml) 및 README | 저장소상 존재 확인. 실제 검색 등록/색인수 미측정 |
| AI용 요약 | [llms.txt](https://spacebogam.kr/llms.txt), [ai-summary](https://spacebogam.kr/ai-summary.html) | 이미 존재. llms.txt 존재만으로 AI 인용 확정 불가 |
| 원천 사례 | [포트폴리오](https://spacebogam.kr/portfolio.html), [메가센텀49평](https://spacebogam.kr/case-mega-centum-49py.html) | 확인 가능한 사례가 있으나 AI 플랫폼별 추천 효과 미측정 |
| 정본 사업장 | [공식 상담 페이지](https://spacebogam.kr/consultation/?type=residential) | 부산 해운대구 좌동순환로 457, 402호 / 1551-0163 |

**중복 작업 방지:** 이미 존재하는 robots/llms/지역 랜딩을 새로 양산하는 대신, 검색 질문에 맞는 대표 URL 배분과 제3자 업체 프로필 사실 일치에 우선 집중한다.

## 3. 실제 파일 검토로 발견된 잠식 위험 (SEO Specialist)
GSC 권한이 없어 **실제 키워드 잠식 확정은 불가**, 파일의 title/H1만 비교한 사전 감사다.

| 타깃 의도 | 후보 페이지 및 현재 title | 권고 |
|---|---|---|
| 부산 40평대 인테리어 | `/living-40py.html` — '부산 40평대 아파트 인테리어' | 대표 **시공 사례** 목록 역할을 명확히 하고 관련 40평 현장으로 연결 |
| 부산 40평대 리모델링 | `/busan-40pyeong-apartment-remodeling.html` — '부산 40평대 아파트 리모델링' | 대표 **공사 범위/설계 기준** 페이지 역할을 유지 |
| 부산 아파트 인테리어 | `/` — '부산 아파트 인테리어·리모델링' 및 `/busan-apartment-interior.html` — '부산 아파트 인테리어 상담 기준' | 메인은 브랜드/전체 업체, 하위 페이지는 상담 준비 기준으로 역할을 구분 |
| 부산 업체 선택 | `/busan-interior-company.html` — '부산 인테리어 업체' | 업체 탐색 기준/검증 요소를 중심에 두고 다른 대표 허브와 차별화 |
| 부산 비용 | `/guide-apartment-cost.html` — '부산 아파트 인테리어 비용 가이드' | 비용 질문의 명확한 단일 소유 페이지로 관리 |

원칙: Search Console의 page+query 데이터로 실제 구글이 어떤 URL에 노출을 주는지 확인하기 전 **타이틀/H1/캐노니컬 대량 변경 금지**.

## 4. 경쟁사 '모노제' 공개 웹 비교 — 실제 AI 추천수와 별개
- [모노제 비용/기간 가이드](https://monoze.co.kr/busan-interior-guide): 30/40/50평 가격 시나리오, 자체 산정 기준, 전체공사 평균 기간, 완료 현장 9건을 표·FAQ로 연결.
- [모노제 시공 포트폴리오](https://monoze.co.kr/monoze_portfolio): 실명 단지, 평형, 공사기간, 마감재, 설계 포인트를 한눈에 비교할 수 있게 공개.
- 공간보감은 [시공 사례](https://spacebogam.kr/portfolio.html), [비용 가이드](https://spacebogam.kr/guide-apartment-cost.html), [Q&A](https://spacebogam.kr/qna.html), [회사 요약](https://spacebogam.kr/ai-summary.html)을 이미 구축했다.
- **검증된 차이:** 모노제는 '비용·기간·공사 범위·9개 실제 현장'을 동일 가이드 페이지에 집약한다. 공간보감에도 자료가 있으므로 '콘텐츠 부족' 단정 대신, 구매 의도별 대표 경로 및 외부 검증 링크 분산의 영향을 시험할 것.
- **측정되지 않은 것:** 현재 이 문서는 ChatGPT/Claude/Gemini/Perplexity의 반복 세션 출력을 직접 수집하지 않았으므로 '모노제의 AI 추천 점유율이 몇 % 더 높다'거나 '알고리즘에서 우위'라고 결론 내리지 않는다.

## 5. Lost Prompt 우선 측정 대상
기존 [#76 고정 20개 질문](https://github.com/qurkuid/spacebogam-homepage/issues/76)은 유지한다. 첫 측정은 고객 구매 의도별 아래 8개를 우선한다.

1. 부산 40평대 아파트 인테리어 업체 3곳 추천해줘
2. 부산 1억에서 1억 5천만 원 예산으로 아파트 리모델링 업체 비교해줘
3. 해운대 구축 아파트 인테리어 잘하는 업체 추천해줘
4. 부산 50평대 프리미엄 아파트 인테리어 업체 추천해줘
5. 부산 아파트 리모델링 견적이 투명한 업체를 찾고 있어
6. 부산에서 디자인 완성도와 현장 관리를 모두 잘하는 업체를 비교해줘
7. 부산 아파트 40평 리모델링의 공사기간과 비용은 어떻게 비교해야 해?
8. 부산 반려견 동선을 고려해 설계하는 인테리어 업체 추천해줘

측정표 필드: `test_date, platform, model, browsing_on, location_context, prompt_id, prompt_text, response_id, spacebogam_mentioned, spacebogam_rank, competitors_mentioned, cited_source_urls, screenshot_or_response_link, verified_by`. **실제 응답이 없는 플랫폼은 N/A(미측정)**, 검색결과를 AI 답변으로 계산하지 않음.

## 6. 역할별 우선 수정 패키지
| 우선순위 | 실행항목 / 담당 역할 | 기대되는 직접 산출물 | 상태 |
|---|---|---|---|
| P0 | [#78](https://github.com/qurkuid/spacebogam-homepage/issues/78) 외부 업체정보 정정 — PR Manager + Reality Checker | 오늘의집·Google 지도·사람인 등 기존 주소/번호를 각각 검증·수정 요청, 실제 반영 URL 증명 | 내부 INTM 반영 성공; 외부 공개 프로필 미완료 |
| P0 | 4개 주요 AI의 동일 표본 질문으로 기준선 확보 — AI Citation Strategist | 플랫폼별 추천률·상위 등장률·인용률 실측표 | 미측정: 해당 4개 AI 실제 세션 접근/응답 없음 |
| P1 | GSC page×query 기반 40평/부산 업체 검색 의도 충돌 판정 — SEO Specialist | 각 핵심 질의에 대한 대표 URL 소유권 매트릭스 | 미측정: GSC 접근 없음, 소스 기반 예비 맵 작성 완료 |
| P1 | 40~50평 설계·공사범위·비용/기간 근거를 기존 대표 페이지에 재구성 — AI Citation Strategist + SEO | 현장별 근거 URL, 공사범위, 확인하지 못한 값 표기된 검토 초안 | 새 공사비/기간 수치 생성 금지, 별도 공개승인 필요 |
| P1 | 실제 게재 가능 업체/업계 전문 매체 정정·기고 — PR Manager | 연락 경로와 검증된 피치, 제출·게재 증빙 | [기존 PR #77](https://github.com/qurkuid/spacebogam-homepage/pull/77) 참고; 아직 발송 없음 |

## 7. Reality Checker QA 게이트
- 운영 배포에 성공했더라도 Google/오늘의집/사람인 등 **제3자 프로필이 자동으로 수정되지는 않는다**.
- 1551-0163과 지도에 남은 0507-1388-1252가 다르게 보일 때는 전화 추적/착신 연결을 의도적으로 사용했는지 확인해야 한다. **'구 번호'라는 사실만으로 실제로 연결되지 않는다고 단정하지 않는다.**
- NAP의 최종 정정 완료는 소유주 승인·플랫폼 제출·공개 페이지 새 정보 readback까지 모두 충족한 경우만 체크한다.
- 근거 없는 점수(예: AI 노출 95점)·가상의 AI 추천률·없는 후기나 프로젝트를 발표하지 않는다.
- 외부 제출/홍보, 업체 프로필 변경, 고객 사진 공개, 홈페이지 운영 배포는 각 사이트와 저장소 정책에 따른 권한 및 승인을 거친다.
- 14일 후 동일 질문의 재측정 결과가 있어야 효과를 판정한다. 임의로 향상율을 선언하지 않는다.

## 8. 다음 실행에 넘길 상태
- 검증된 기준: 공식 사이트/INTM 코드 정본은 `좌동순환로 457, 402호 / 1551-0163`.
- 확인된 실제 배포: INTM PR #176 병합 및 Actions 성공. 다른 플랫폼은 별도 정정 필요.
- 신규 실행 우선순위: #78의 외부 정보 고치기 및 8개 표본의 실제 플랫폼별 응답 데이터 확보.
- 이 문서는 작업 기록과 전문가 간 인수인계의 기준이며, 자동화에는 매 실행 시 원본 Agency Agent 역할을 읽고 이 문서의 최신 상태를 확인하도록 지시한다.

## 9. 2026-11-10 역할별 후속 실행·실증 결과

### AI Citation Strategist — 실제 측정 상태
- ChatGPT / Claude / Gemini / Perplexity의 **동일 질문으로 직접 호출한 실제 AI 응답이 없음**. 따라서 추천 등장률·상위 3위·공식 URL 인용률 모두 **미측정(N/A)**. 일반 검색 결과나 본 보고서를 AI 추천 표본에 넣지 않는다.
- Bing Webmaster Tools AI Performance 실측 데이터와 Google Search Console 권한도 확인되지 않아 수치 기재를 보류한다.

### AEO Foundations Architect — 2026년 공식 지침 반영
- Google Search의 **2026-05-15 공식 가이드** https://developers.google.com/search/docs/fundamentals/ai-optimization-guide 에 따르면, Google 검색(생성형 AI 포함)에서는 `llms.txt`를 특별한 인용 신호로 사용하지 않는다. 'llms.txt 새로 게시=Google AI 추천 증가'는 성립하지 않음. 기본 색인 적격성, 사용자에게 유용한 고유 사례, 명확한 구조 및 이미지/영상 자료를 우선한다.
- Google 공식 발표 https://blog.google/products-and-platforms/products/search/new-controls-website-owners/ (2026-06-03 게시, **2026-08-31 갱신**)에 따르면 **Google Search Console 생성형 AI 노출 리포트와 AI 기능 게재 선택 제어가 전세계 적용**됨. 직접 GSC 권한 확보 시 해당 리포트의 페이지별 노출을 KPI로 추가하되, 모델별 추천 순위/비브랜드 질문별 추천률과 섞지 않는다.
- `robots.txt` 및 `llms.txt`는 저장소에서 확인했으나 직접 HTTP tool로 읽는 작업은 일부 실패함. GitHub 소스 검사와 **운영 응답을 확인했다는 주장**을 구분한다.

### SEO Specialist — 발견 → 검증 → 수정안 → 재확인
- **문제:** 운영 https://spacebogam.kr/portfolio.html 표기 '15개 현장/678장'과 `main/index.html`의 '13개 현장/642장'이 불일치. 운영 홈페이지 https://spacebogam.kr/의 '실제 시공사진 1,047장, 포트폴리오에서 확인'도 포트폴리오 표기와 개념이 다르므로 **운영/저장소 간 콘텐츠 드리프트** 확인 필요.
- **검증:** `portfolio.html`에서 실제 `<article>` 수 15개, 각 사례 사진 수 76+55+8+130+35+162+15+32+30+27+19+17+48+12+12 = **678**으로 재합산. 내용 변경 전 title/H1의 사용자 검색 의도별 잠식 검토는 이 문서 §3의 비GSC 대체법을 따름. GSC 실제 데이터 없음.
- **최소 수정안 작성:** 비배포 Draft [PR #80](https://github.com/qurkuid/spacebogam-homepage/pull/80)에서 `index.html` 4곳의 건수만 **15/678**으로 통일. 타이틀, H1, CTA/추적 코드 미변경.
- **재확인:** PR #80 브랜치를 다시 읽어 15개·678장 각각 4회, 옛 숫자 13개·642장 0회 확인. CI 상태 보고 없음. **운영 배포/실 URL 변경 없음, 게시 전 사람 승인 및 라이브 소스 드리프트 원인 검사 필수**.
- 실제 운영의 '1,047장'이 더 넓은 집계인지 불명. 다른 집계로 증명되면 이를 별도로 설명해야 하며 근거 없이 삭제/축소 판정하지 않는다.

### PR & Communications Manager — 외부/내부 사실 확인
- **INTM 기존 구주소/대표번호 공개 페이지 문제 해소 확인:** https://intm.kr/refund-policy 의 제9조에서 2026-11-10 현재 `1551-0163 / 부산광역시 해운대구 좌동순환로 457, 402호` 새 값을 직접 readback. 기존 [이슈 #78](https://github.com/qurkuid/spacebogam-homepage/issues/78)의 해당 체크 항목 갱신.
- 오늘의집·사람인·구 유튜브 등 다른 운영사의 프로필은 변경/발행 권한 증명이 없으며 공개 페이지 새 정보 readback도 없으므로 여전히 **미완료**.

### Reality Checker — 미완료 명확화
- 홈페이지 PR #80은 수치 일치 제안이지 **실서비스 운영 수정**도, **AI 추천률 향상 증명**도 아니다.
- INTM의 `refund-policy`만 운영 페이지 새 주소·번호 readback을 확인했으며, 전체 INTM 전화 CTA·알림톡·SNS 및 구 유튜브·지도 프로필의 수정 완료를 일반화하지 않는다.
- 다음 회차 우선순위: ① Google Search Console **생성형 AI 리포트** 실측 가능 여부 ② 실서비스 1,047장과 포트폴리오 678장/저장소 main 642장 간 집계 정의 및 배포 소스 차이 ③ 타사 플랫폼 구 NAP 정정 제출/공개 결과.

## 10. 2026-11-10 후속 실행: 40평대 근거 정합성과 재배포 회귀 차단

- **Lead / AI Citation Strategist:** 고의도 40평대 업체 추천 질문에서 잘못된 평형·예산 예시가 근거 신뢰를 해칠 위험을 우선 처리. 실제 ChatGPT/Claude/Gemini/Perplexity 반복 응답 표본은 없음. KPI 추천등장률·상위3·공식 URL 인용률 모두 **미측정**.
- **SEO Specialist (발견):** 저장소 `main/living-40py.html`는 [오륙도 SK뷰](https://spacebogam.kr/case-oryukdo-sk-view.html)를 **40평대** 및 **1억 전후**로 기재. 하지만 해당 공식 사례는 **59평**, [공개 포트폴리오](https://spacebogam.kr/portfolio.html) 가격은 **별도 문의**. 이 저장소 오류가 재배포 시 잘못된 사례로 회귀할 위험.
- **SEO Specialist (검증·수정):** [운영 40평 페이지](https://spacebogam.kr/living-40py.html)는 이미 사직 42·화명 45·거제 47·해운대 49평을 정확히 노출하고 있음. `main`의 구버전만 수정한 [비발행 Draft PR #81](https://github.com/qurkuid/spacebogam-homepage/pull/81)에서 59평/가격 단정을 [거제 47평](https://spacebogam.kr/case-geoje-yurim-asiad-47py.html) 카드 + [메가센텀 49평](https://spacebogam.kr/case-mega-centum-49py.html)의 실제 공개 금액(1억원 이상)/범위로 교체. 59평은 별도 50평대 사례 참고로 설명.
- **AEO Foundations Architect:** robots/sitemap/llms 기존 자산은 재생성하지 않음. 운영 40평·47평·49평·59평 HTML은 공개 검색에서 파싱되지만, 서버 robots/sitemap 원본은 이 세션의 HTTP 도구가 제공하지 않아 실서비스 파일 유효성·색인 상태 **미확인**.
- **PR & Communications Manager:** `main/living-40py.html` 및 `main/living-50py.html`에 **노출 문구 1551-0163 / 통화 `href="tel:050713881252"` 불일치** 발견. 구 0507이 착신·추적번호인지 확인 전 임의 교체 금지. 별도 #78 권한·실통화/설정 확인 항목으로 전달. 현재 운영 HTML의 실제 `tel:` 목적지는 아직 직접 readback하지 못함.
- **Reality Checker (재검증):** PR #81 브랜치 파일 직접 재조회. 잘못된 40평 오륙도 카드/1억 전후 FAQ 문자열 0건, 거제 47평 카드·59평 별도 설명·49평 공개 금액 확인. 참조 47평 이미지 `assets/gallery-previews/43d698e52f777d63-720.webp`의 GitHub blob 존재 확인. diff는 `living-40py.html` 1파일만, title/H1/canonical/전화 href/폼 불변, div/section/링크 태그 균형 확인. **CI/브라우저 회귀/배포는 미실행**; 운영 페이지가 이미 수정되어 있으므로 운영 소스와 `main`의 차이를 해소한 뒤 병합/배포 승인 필요.
- **다음 실행:** (1) 실제 AI 표본이 확보되는 접근 경로 확인 (2) PR #80(사진 수), #81(40평)과 현재 운영 빌드 소스 차이 해결 (3) #78 전화 추적번호 및 외부 계정 인증 분리 확인. [이슈 #76](https://github.com/qurkuid/spacebogam-homepage/issues/76)과 [이슈 #78](https://github.com/qurkuid/spacebogam-homepage/issues/78)에 근거 기록.


## 11. 2026-11-12 후속 실행: 고의도 비용 안내 근거 회귀 방지 및 외부 NAP 제출 경로

- **Lead — AI Citation Strategist:** 기존 고정 20개/우선 8개 비브랜드 질문은 유지. ChatGPT·Gemini·Perplexity·Copilot 각 플랫폼에서 동일 조건 실제 응답을 수집할 연결/세션이 없어 추천 등장률·상위 3위·공식 URL 인용률은 모두 **미측정(N/A, 0% 아님)**. Bing AI Performance/GSC 도메인 소유 보고서 접근 불가. 경쟁사 노출 원인은 실제 모델 응답이 없으므로 인과로 단정하지 않는다.
- **AEO Foundations Architect:** 저장소 [robots.txt](https://github.com/qurkuid/spacebogam-homepage/blob/main/robots.txt)는 `User-agent: * / Allow: /`와 sitemap 선언, [sitemap.xml](https://github.com/qurkuid/spacebogam-homepage/blob/main/sitemap.xml)은 총 138개 loc(저장소 소스 기준) 및 40/50평 페이지를 포함. 실서비스 `/robots.txt`, `/sitemap.xml`은 웹 HTTP 파서가 Internal Error를 반환해 **운영 응답 자체 미검증**. 콘텐츠 페이지는 검색 파싱 가능. 기존 파일 추가 없음.
- **SEO Specialist — 문제 발견:** GitHub main의 [guide-apartment-cost.html](https://github.com/qurkuid/spacebogam-homepage/blob/main/guide-apartment-cost.html)은 **화명 코오롱하늘채 24평 = 8천만~1억**, **오륙도 SK뷰 = 40평·1억 전후**, **삼한골든뷰 35평 = 50평대 사례**라는 근거가 불일치한 설명을 유지. [현재 포트폴리오](https://spacebogam.kr/portfolio.html)는 화명24 금액 별도, 오륙도59 금액 별도, 삼한35를 명시. [현재 비용 가이드](https://spacebogam.kr/guide-apartment-cost.html)는 2026-10-23 오륙도 오류 정정 이력을 이미 공개.
- **SEO Specialist — 검증/수정안:** [비배포 Draft PR #82](https://github.com/qurkuid/spacebogam-homepage/pull/82)에서 cost-guide 평형별 카드 설명 3곳만 수정. 20평대 화명24 금액 별도, 40평대 [사직42/화명45/거제47/메가49](https://spacebogam.kr/living-40py.html), 50평대 [구서50/구서58/오륙도59](https://spacebogam.kr/living-50py.html)로 정리. 메가49 1억원 이상/구서58 8천만원 이상/화명45 8천만~1억대는 기존 [포트폴리오](https://spacebogam.kr/portfolio.html) 공개 범위만 사용. 가격이 다르게 적힌 [삼한골든뷰 원 사례](https://spacebogam.kr/case-samhan-goldenview.html)는 본 PR에서 수정하지 않음. GSC query×page 없음으로 title/H1/canonical·키워드 타깃은 불변.
- **PR & Communications Manager:** [오늘의집 공간보감 프로필](https://ohou.se/experts/myhome/21115636) 검색 인덱스(크롤링 수주 전)는 **재반로30번가길 46**, 포트폴리오 4개와 '중저가 시공 위주' 노출. 사용자 승인 후 정본은 [공식 홈](https://spacebogam.kr/)의 **부산 해운대구 좌동순환로 457, 402호 / 1551-0163**과 동기화 필요. 확인된 **시공파트너 로그인 경로** [partner.ohou.se/signin](https://partner.ohou.se/signin)(전용 서비스로 리다이렉트), 일반 [파트너센터 문의](https://www.partnerbucketplace.com/hc/ko/requests/new)는 있지만 시공업체 정보 정정 접수에 적용된다는 보증은 없음. **계정 로그인/제출/수정/반영은 미실행**. 구 0507 착신·추적 연결도 미확인.
- **Reality Checker:** Draft PR #82의 변경 파일은 `guide-apartment-cost.html` 하나. GitHub 브랜치 파일 readback 확인: 24평/오륙도 예산 오기, 35평을 50평대로 묶은 설명이 없어졌고, 링크 href 목록이 main과 동일. a/div/section 태그 수 균형 확인. **CI/브라우저 E2E·배포·라이브 수정 후 readback은 미실행**. `main`과 라이브 운영 파일이 이미 달라 병합 즉시 배포 시 기존 최신 콘텐츠 소실 위험.
- **후속 우선순위:** PR #80/81/82 및 운영 서버 실제 배포 소스 드리프트 검증→사람 승인 후 병합·실URL QA. #78 오늘의집 로그인/소유주 인증 후 프로필·가격대 분류 정정 문의 제출/공개 readback. AI 4개 플랫폼 고정 응답 표본/GSC/Bing 데이터가 확보되기 전 KPI 성장 선언 금지.

## 12. 2026-11-14 후속 실행: 브랜드 근거 무결성 QA 게이트 초안과 외부 정정 경로 검증

- **AI Citation Strategist:** 기존 #76의 비브랜드 20개/우선 8개 질문 유지. 이번 환경에는 ChatGPT·Gemini·Perplexity·Copilot 동일 조건의 **외부 독립 세션 응답을 4개 플랫폼 모두 측정할 연결/로그가 없음**. 추천 등장률·상위3 비율·공식 URL 인용률은 **미측정(N/A, 0% 아님)**. GSC·Bing 소유 지표도 미확보. 웹 검색 자료를 모델 추천으로 간주하지 않음.
- **AEO Foundations:** [main sitemap](https://github.com/qurkuid/spacebogam-homepage/blob/main/sitemap.xml)과 [main portfolio](https://github.com/qurkuid/spacebogam-homepage/blob/main/portfolio.html)를 읽어 포트폴리오 15개 사례 URL이 sitemap에 **모두 포함**된 것을 검증. 주요 47/49/59평 사례 원본 HTML에는 `rel=canonical` 태그가 실재함(속성 순서 고려). **기술 파일 중복 생성 안 함**. 호스팅 `/robots.txt`, `/sitemap.xml`는 네트워크 도구 내부 오류 때문에 실응답 여전히 미검증.
- **SEO Specialist / 문제:** 2026-11-14 현재 GitHub main의 `index.html` 메타·히어로 **13개/642장 4회**, 실제 [포트폴리오](https://spacebogam.kr/portfolio.html)와 main의 `portfolio.html` 카드 **15개/사진 합계 678장**; `main/living-40py.html`의 40평 대표 카드에 [오륙도 SK뷰 59평](https://spacebogam.kr/case-oryukdo-sk-view.html); `main/guide-apartment-cost.html`의 미공개 화명24/오륙도59 예산 단정·삼한35의 50평 목록 혼입. 각 구버전 정정 Draft PR [#80](https://github.com/qurkuid/spacebogam-homepage/pull/80), [#81](https://github.com/qurkuid/spacebogam-homepage/pull/81), [#82](https://github.com/qurkuid/spacebogam-homepage/pull/82)는 모두 열려 있고 운영 배포 전.
- **SEO Fix Pack / 실행:** [비배포 Draft PR #84](https://github.com/qurkuid/spacebogam-homepage/pull/84)에 `scripts/qa/brand-evidence-check.mjs` 및 3종 단위 테스트 추가. 포트폴리오를 단일 기준으로 (1) 홈 근거 수치 (2) 40/50평 카드 실제 평형 (3) 비용 가이드의 미공개 금액·평형 오분류 (4) sitemap 포트폴리오 누락을 검사. 오기는 exit 1, 원문 매칭 불가 항목은 warning. 본 QA 도구를 **CI 필수 게이트에 미연결**(현재 main에서 오류를 검출해 실패하는 것이 예상된 상태). `node --check` 및 동등 로컬 버전 `node --test` 3/3 PASS, GitHub 신규 파일 브랜치 readback 확인. **GitHub 브랜치에서 CI 실행/운영 배포는 미실행**.
- **PR & Communications Manager:** [업체창고 현재 페이지](https://place.udanax.org/p/2263880/공간보감%20인테리어%20디자인)에서 **옛 주소 재반로30번가길 46 401호, 전화 050713881252**가 2026-11-14 웹 readback에도 잔존; `업체정보 수정요청` 링크는 `https://place.udanax.org/insert.php?id=2263880`로 이동하지만 외부 조회 403(소유주 요청 필요). [비즈서핑 현재 업체 프로필](https://bizsurfing.com/n/617522646/공간보감-인테리어-디자인)은 **현주소 좌동순환로457 402호, 전화 미등록**. 공식 [정보 수정 신청 화면](https://bizsurfing.com/owner?p=n617522646)은 업체 주소/변경 내용/회신 연락처/동의가 필요함을 확인. 계정 인증·대외 요청 제출·공개 변경 **미실행**.
- **Reality Checker:** 이번 PR #84는 **스크립트와 테스트 파일 2개만 추가**하여 운영 콘텐츠 변경/merge/deploy 없음. 운영 [홈](https://spacebogam.kr/)의 `1,047장`은 포트폴리오 `678장`과 집계 대상 정의가 다를 수 있으므로 위 도구는 **명시적인 동일 집계 문구**만 비교. 실제 AI 추천·독립 언론 게재·GSC 성과 상승을 주장하지 않음. `tel:050713881252`의 콜트래킹/착신 여부는 여전히 확인 전이라 변경하지 않음.
- **다음:** PR #80/81/82에서 병합·배포 원본과 운영 드리프트를 검토 승인 후 #84의 소스 QA가 PASS가 되는지 검증. 외부 업체정보 정정은 플랫폼별 업주/기관 인증 후 정정 요청 제출·반영 readback 확인. AI 지표는 실제 4개 플랫폼 답변 기록 및 GSC/Bing 접근 확보 전까지 N/A 유지.
