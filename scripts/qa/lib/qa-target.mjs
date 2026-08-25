// CMP-155: QA 프로브 대상 URL 공용 리졸버.
//
// 배경: CMP-142 컷오버 이후 https://spacebogam.kr 는 origin/main 배포본(release)만 서빙한다.
// 커밋 전 편집은 https://spacebogam.kr 에 더 이상 반영되지 않으므로, 하드코딩된 스크립트로
// 커밋 전 변경을 검증하면 배포된 구버전을 검사하고 PASS 를 내는 조용한 오탐이 난다.
//
// 규약: 대상을 바꿔야 하는 QA 프로브는 이 모듈로 BASE_URL 을 읽는다.
//   BASE_URL 미지정 -> https://spacebogam.kr (배포 후 검증, 기본값)
//   BASE_URL=http://127.0.0.1:3023 -> 작업 트리 preview (커밋 전 검증, 로컬 전용)

export const DEFAULT_BASE_URL = 'https://spacebogam.kr';

export function resolveBaseUrl() {
  return (process.env.BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, '');
}

/**
 * 실행 시작 시 대상 URL 을 stdout 첫 줄에 출력한다(어느 쪽을 검사했는지 증거로 남기기 위함).
 * @param {string} label 스크립트 식별자, 예: 'CMP96'
 * @returns {string} 정리된 BASE_URL (끝 슬래시 제거)
 */
export function announceTarget(label) {
  const base = resolveBaseUrl();
  console.log(`[${label}] target BASE_URL = ${base}`);
  return base;
}
