# CMP-XXX — <검증 제목>

- 일시: YYYY-MM-DD (KST)
- 검사 대상 BASE_URL: `https://spacebogam.kr` (배포 후 검증) 또는 `http://127.0.0.1:3023` (커밋 전 preview 검증)
  <!-- CMP-155: scripts/qa/* 는 BASE_URL 환경변수로 대상을 바꾼다. 어느 쪽을 검사했는지
       반드시 여기 적는다 — CMP-142 컷오버 이후 두 대상의 콘텐츠가 다를 수 있다. -->
- 계기: [CMP-XXX](/CMP/issues/CMP-XXX)
- 도구:
- 운영 쓰기 여부:

## 판정: **PASS / FAIL — <심각도>**

| # | 산출물 | 결과 | 근거 |
|---|---|---|---|

## 재현

```
BASE_URL=<검사 대상> node scripts/qa/<스크립트>.mjs <출력디렉터리>
```

## 남은 위험 / 다음 행동
