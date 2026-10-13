// PM2 진입점 — PM2는 CommonJS로 스크립트를 불러오므로, 여기서 ESM 서버(src/index.js)를 연다
import('./src/index.js').catch((e) => {
  console.error('[server] 시작하지 못했어요:', e);
  process.exit(1);
});
