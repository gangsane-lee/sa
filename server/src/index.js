/**
 * 사緣 API 서버 시작점 — PM2는 start.cjs 를 통해 이 파일을 실행한다.
 */
import { config } from './config.js';
import { openStore } from './store.js';
import { directory } from './sso.js';
import { initAdmins, isAdmin, verifyAdminPassword } from './admins.js';
import { createApp } from './app.js';

if (config.sso.mode === 'header' && !config.sso.proxySecret) {
  console.warn('[server] SSO_MODE=header 인데 SSO_PROXY_SECRET 이 비어 있어 SSO 자동 로그인이 꺼져 있어요. 앞단 프록시와 같은 비밀값을 넣어 주세요.');
}
if (config.session.secretMissing) {
  console.warn('[server] SESSION_SECRET 이 비어 있어 임시 값을 써요. 서버를 다시 켜면 모두 로그아웃돼요. .env 에 채워 주세요.');
}

const store = await openStore(config);
await initAdmins();
const app = await createApp({
  config,
  store,
  directory,
  admin: { isAdmin, verify: verifyAdminPassword },
});

const server = app.listen(config.port, config.host, () => {
  console.log(`[server] 사緣 서버 시작 · ${config.publicUrl} (저장소: ${store.kind}, 화면 모드: ${config.serviceMode}, 관리자 주소: ${config.adminPath})`);
  console.log(`[server] SSO 모드: ${config.sso.mode} · 로그인 API: ${config.sso.loginUrl ? '연결됨' : '없음'}`);
});

// PM2 재시작·종료 때 진행 중인 저장을 마치고 끝낸다
async function shutdown(signal) {
  console.log(`[server] ${signal} — 종료 중`);
  server.close();
  try {
    await store.flush();
    await store.close();
  } finally {
    process.exit(0);
  }
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
