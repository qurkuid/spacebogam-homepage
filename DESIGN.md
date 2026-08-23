# DESIGN.md — 공간보감 시각 정본

> 이 문서는 새로 만든 취향이 아니다. **라이브 `spacebogam.kr`가 실제로 렌더하는 값**을
> 헤드리스 브라우저 computed style로 측정해 받아 적은 것이다.
> 정본 구현체는 `assets/preview-v8.css` 하나다.
> Last measured: 2026-08-22 (Chrome headless, 390×844 / 1440×900)

## Palette

토큰은 3개뿐이다. 이게 전부다.

| 토큰 | 값 | 쓰임 |
|---|---|---|
| `--paper` | `#f6f3ed` | 페이지 배경. **흰색(`#fff`)이 아니다** |
| `--ink` | `#1e1d1a` | 본문·제목·1차 CTA 채움. **검정(`#000`)이 아니다** |
| `--line` | `#d9d4ca` | 구분선 헤어라인 1px |

**액센트 색이 없다.** 이것이 이 브랜드의 정의적 특징이다.
강조는 색이 아니라 **크기 · 여백 · 헤어라인 · 반전(ink 면 위 paper 글자)** 으로 만든다.
브랜드 색을 하나 "골라서" 추가하는 순간 브랜드 위반이다.

> 2026-08-22 브랜드 FAIL의 원인: 상업 랜딩이 `assets/commercial.css`(고아 파일)의
> `--brown: #b06743`를 썼다. 그 갈색은 `--paper` 위에서 대비 3.9:1로 WCAG AA에도 미달한다.
> **`assets/commercial.css` / `assets/site.css`는 죽은 옛 판이다. 로드하지 않는다.**

## Type

- 서체: **SUIT Variable** — `assets/SUIT-Variable.woff2`, `font-family: Suit`.
  시스템 스택은 폴백일 뿐이다. computed `fontFamily`가 `Suit`로 시작하지 않으면 실패다.
- **제목은 크고 얇다.** `h1 { font-weight: 400 }`. 측정값:

| 화면 | h1 size | weight |
|---|---|---|
| 홈 desktop | 72px | 400 |
| 홈 mobile | 38px | 400 |
| 상업 랜딩 desktop | 58px | 400 |
| 상업 랜딩 mobile | 34px | 400 |

  굵은 헤드라인(600·700)은 위반이다. 크기로 위계를 만들고 무게로 만들지 않는다.
- eyebrow: 작은 크기 + 넓은 자간, `--ink`의 흐린 톤. 모든 섹션 도입부가 이 규격을 쓴다.
- 본문 행간은 넉넉하게. 문단은 짧게 끊는다.

## Shape

- **모든 모서리는 직각이다.** `border-radius: 0`. 알약 버튼(999px) 금지.
- **그라데이션 없음. 드롭섀도 없음.** computed `boxShadow`는 `none`이어야 한다.
- 카드 박스로 묶지 말고 **헤어라인으로 나눈다**. 목록은 `01 / 02 / 03` 번호 + 헤어라인.
- 헤더 `.v8-header`: 높이 74px, 하단 1px 헤어라인, 좌측 워드마크 "공간보감".

## CTA

1차 CTA는 **ink 채움 직각 블록**이다 — 배경 `#1e1d1a`, 글자 `#f6f3ed`, radius 0, shadow none.
2차는 **밑줄 텍스트 링크**. 3차 이상은 만들지 않는다.

상업 랜딩(`/commercial/call/`)의 전화 CTA는 3곳, 전부 `data-v8-event="phone_click"`.
전화 CTA는 **대면상담 예약으로 가는 1차 경로**다 — 라벨·주변 카피에 통화로 상담이
끝난다는 약속(전화 상담 완결, "통화 ○분" 등)을 쓰지 않는다:

| `data-cta-location` | 형태 |
|---|---|
| `commercial_call_header` | 헤더 텍스트 링크 (ink) |
| `commercial_call_hero` | ink 채움 블록 — 1차 |
| `commercial_call_sticky` | 하단 고정 ink 바 (모바일) |

## Imagery

- 주거 면(홈·사례)은 **실제 시공 사진이 리드한다.** 히어로 전면 사진 + 그 위 paper 글자.
- 상업 면은 **사진이 없다.** 상업 시공 사례가 0건이기 때문이다(→ PRODUCT.md).
  연출컷·스톡·AI 이미지로 메우지 않는다. 대신 **타이포 히어로 + 헤어라인 목록**을 쓴다.
  이건 타협이 아니라 정직함이며, 두 면은 헤더·서체·색·형태가 같아 한 가족으로 읽힌다.

## Voice

- 조건을 먼저 말하고 결과를 나중에 말한다. ("예쁜 완성보다, 먼저 확인할 것이 있습니다")
- 숫자·조건은 구체적으로, 성과는 주장하지 않는다.
- 느낌표·과장·긴급성 압박("지금 바로", "한정") 없음.
- 금액을 먼저 말하지 않는다 → "정확한 견적은 전화상담과 현장 확인 후 안내드립니다."

## 검수 — 기계로 재는 항목

헤드리스 computed style로 측정한다. 눈으로 판정하지 않는다.

1. `body` background = `rgb(246, 243, 237)`
2. `body` color = `rgb(30, 29, 26)`
3. `fontFamily`가 `Suit`로 시작
4. `h1` fontWeight = `400`
5. 1차 CTA background = `rgb(30, 29, 26)`, color = `rgb(246, 243, 237)`
6. 모든 CTA `borderRadius` = `0px`
7. 모든 CTA `boxShadow` = `none`
8. 문서 어디에도 `#b06743` 계열 갈색 없음
9. 로드된 스타일시트에 `commercial.css` / `site.css` 없음
10. 데스크톱·모바일 양쪽 렌더 확인

## Impeccable detector 사용 시 — 중요

`scripts/detect.mjs`의 `cream-palette` 규칙은 **`--paper #f6f3ed`를 "AI 슬롭"으로 경고한다.**
이 경고는 우리 브랜드에 한해 **무시한다.** 근거:

- 라이브 홈(`index.html` + `preview-v8.css`)을 그대로 통과시키면 경고 6건이 나온다.
  즉 이 규칙들을 그대로 합격/불합격 기준으로 쓰면 **회사 홈페이지 자신이 탈락한다.**
- Impeccable SKILL.md 자체가 명시한다:
  *"The brief wins. Honor pinned aesthetics … even when they conflict with a saturated-pattern warning."*

따라서 detector 결과는 **incumbent(홈) 대비 상대 비교**로 읽는다.
새 면의 findings ≤ 홈의 findings 이면 브랜드 정합은 통과다.
`low-contrast`(접근성)만은 브랜드 예외 없이 실제 결함으로 취급한다.
