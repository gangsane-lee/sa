/*
 * 사緣 화면 설정 — 개발 모드(npm run dev)용.
 * 운영 빌드(npm run build)는 servers.config.mjs 값으로 이 파일을 새로 만든다 (관리자 주소 · 사내 인사정보 URL).
 * 개발/운영 모드는 이 파일이 아니라 명령으로 정해진다: npm run dev = 개발 모드, npm run build = 운영 모드
 */
window.SAYEON_CONFIG = {
  // 관리자 화면 주소 (사용자 화면에는 들어가는 버튼이 없다)
  adminPath: '/changeme',
};
