/**
 * 시작 전 확인 — Node.js 기본 모듈만 쓴다 (라이브러리를 불러오기 전에 돌아야 하므로)
 *  main.js(IIS + iisnode) · npm run check · npm run db:setup 이 가장 먼저 부른다.
 *
 *  - Node.js 22.12.0 이상인지
 *  - Windows 에서 설치 경로에 한글 등 영문이 아닌 글자가 있는지
 *    Node.js 22.12.x 는 이런 경로(예: C:\Users\홍길동\바탕 화면\sa)의 node_modules 패키지를 불러오다
 *    오류 메시지 없이 강제 종료된다(Segmentation fault). 라이브러리를 부르기 전에 막아야 원인을 알려줄 수 있다.
 */
const path = require('node:path');

const MIN_NODE = '22.12.0';
const ROOT = path.resolve(__dirname, '..');

function preflight() {
  const problems = [];
  const [major, minor] = process.versions.node.split('.').map(Number);
  if (major < 22 || (major === 22 && minor < 12)) {
    problems.push({
      title: `Node.js ${process.versions.node} — ${MIN_NODE} 이상이 필요해요`,
      reason: '화면 빌드 도구(Vite 8)와 DB 드라이버가 Node.js 22.12 이상에서만 동작해요.',
      fix: [`Node.js ${MIN_NODE} 설치 후 다시 실행해 주세요. (node -v 로 확인)`],
    });
  }
  if (process.platform === 'win32' && /[^\x20-\x7E]/.test(ROOT)) {
    const crashes = major === 22 && minor === 12;
    problems.push({
      title: `설치 경로에 한글 등 영문이 아닌 글자가 있어요: ${ROOT}`,
      reason: crashes
        ? `Node.js ${process.versions.node} 은 Windows 에서 이런 경로의 패키지를 불러오다 오류 메시지 없이 강제 종료돼요. 서버 시작·화면 빌드·점검 모두 안 돼요.`
        : '일부 도구가 이런 경로에서 오동작할 수 있어요.',
      fix: ['영문·숫자로만 된 폴더로 옮겨 주세요. 예: C:\\apps\\sa  (코드를 받을 때부터  cd C:\\apps  →  git clone ...)'],
      fatal: crashes,
    });
  }
  return { root: ROOT, problems, fatal: problems.some((p) => p.fatal !== false) };
}

/** 문제를 출력한다. 치명적이면 true */
function reportPreflight(log = console.error) {
  const { problems, fatal } = preflight();
  for (const p of problems) {
    log(`  ${p.fatal === false ? '⚠' : '✖'} ${p.title}`);
    if (p.reason) log(`      원인: ${p.reason}`);
    for (const f of p.fix ?? []) log(`      해결: ${f}`);
  }
  return fatal;
}

module.exports = { preflight, reportPreflight, MIN_NODE };
