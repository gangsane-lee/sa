/**
 * 관리 스크립트 실행기 —  npm run check / db:setup / sso:test 가 이 파일을 거친다.
 * 라이브러리를 불러오기 전에 Node.js 버전·설치 경로부터 확인한다(server/preflight.cjs).
 * (Node.js 22.12 + Windows 한글 경로에서는 .js 파일을 바로 실행하거나 패키지를 불러오는 순간 강제 종료되므로,
 *  .mjs 로 시작해 원인을 먼저 알려준다)
 *
 *   node scripts/run.mjs check
 *   node scripts/run.mjs db-setup -- --check
 *   node scripts/run.mjs sso-test -- --ip 10.1.2.3
 */
const name = process.argv[2];
if (!['check', 'db-setup', 'sso-test'].includes(name)) {
  console.error('사용법: node scripts/run.mjs check | db-setup | sso-test');
  process.exit(1);
}
process.argv.splice(2, 1); // 스크립트에는 이름 뒤의 옵션만 넘긴다

const { reportPreflight } = (await import('../preflight.cjs')).default;
console.log('');
if (reportPreflight(console.log)) {
  console.log('\n  위 문제 때문에 서버와 점검 도구가 라이브러리를 불러오지 못해요. 고친 뒤 다시 실행해 주세요.\n');
  process.exit(1);
}
await import(`./${name}.js`);
