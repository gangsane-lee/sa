// PM2 진입점 — PM2는 CommonJS로 스크립트를 불러오므로, 여기서 ESM 서버(src/index.js)를 연다
// 라이브러리를 불러오기 전에 Node.js 버전·설치 경로를 먼저 확인한다 (preflight.cjs)
// require 대신 import() 를 쓰는 이유: Node.js 22.12 + Windows 한글 경로에서 require 는 강제 종료된다
import('./preflight.cjs')
  .then(({ default: pf }) => {
    if (pf.reportPreflight()) {
      console.error('[server] 시작하지 못했어요 — 위 내용을 고친 뒤  pm2 restart sayeon-api');
      process.exit(1);
    }
    return import('./src/index.js');
  })
  .catch((e) => {
    console.error('[server] 시작하지 못했어요:', e);
    process.exit(1);
  });
