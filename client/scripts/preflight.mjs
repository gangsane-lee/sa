/**
 * 빌드 전 확인 — npm run build 가 자동으로 먼저 실행한다(prebuild).
 * Node.js 버전과 설치 경로를 확인한다. 규칙은 서버와 같다(server/preflight.cjs).
 * (Node.js 22.12 + Windows 한글 경로에서는 빌드 도구가 오류 메시지 없이 강제 종료되므로 먼저 알려준다)
 */
const { reportPreflight } = (await import('../../server/preflight.cjs')).default;
if (reportPreflight(console.log)) {
  console.log('\n  위 문제 때문에 화면을 빌드할 수 없어요. 고친 뒤 다시  npm run build  해 주세요.\n');
  process.exit(1);
}
