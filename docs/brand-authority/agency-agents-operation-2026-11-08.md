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
