/*
 * 사緣 운영 설정 — 배포 후 이 파일만 고치면 모드가 바뀐다 (다시 빌드할 필요 없음)
 *   mode: 'test' → 테스트 운영 (서버 없이 가짜 데이터로 모든 기능 테스트, 화면에 '테스트 운영 중' 표시)
 *   mode: 'open' → 정식 오픈 (실제 /api 서버 사용)
 * IIS/Nginx에서 이 파일은 캐시하지 않도록 설정할 것 (Cache-Control: no-store)
 */
window.SAYEON_CONFIG = {
  mode: 'test',
  // 관리자 화면 주소 (사용자 화면에는 들어가는 버튼이 없다)
  adminPath: '/changeme',
};
// ※ 운영 서버(server/)가 화면을 내보낼 때는 이 파일 대신 server/.env 의 SERVICE_MODE·ADMIN_PATH 로 만든 값이 내려간다
