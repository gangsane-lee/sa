/**
 * 사緣 API 서버 시작점 — PM2는 start.cjs 를 통해 이 파일을 실행한다.
 */
import { config, topology } from './config.js';
import { openStore } from './store.js';
import { directory } from './sso.js';
import { initAdmins, isAdmin, verifyAdminPassword } from './admins.js';
import { createApp } from './app.js';

if (config.session.secretMissing) {
  console.warn('[server] SESSION_SECRET 이 비어 있어 임시 값을 써요. 서버를 다시 켜면 모두 로그아웃돼요. .env 에 채워 주세요.');
}

if (topology.problems.length) {
  console.error('[server] servers.config.mjs 확인이 필요해요:');
  for (const p of topology.problems) console.error(`  - ${p}`);
  console.error('[server] 고친 뒤  npm run check  →  pm2 restart sayeon-api');
  process.exit(1);
}

let store;
try {
  store = await openStore(config);
} catch (e) {
  // 원인·해결이 담긴 문구를 남기고 끝낸다 (PM2는 잠시 뒤 다시 시도한다 — ecosystem.config.cjs 의 restart_delay)
  console.error(`[server] 시작하지 못했어요 — ${e.name === 'DbSetupError' ? e.message : e.stack ?? e}`);
  console.error('[server] 설정을 고친 뒤 server 폴더에서  npm run check  로 확인하고  pm2 restart sayeon-api');
  process.exit(1);
}
await initAdmins();
const app = await createApp({
  config,
  store,
  directory,
  admin: { isAdmin, verify: verifyAdminPassword },
});

const server = app.listen(config.port, config.host, () => {
  console.log(`[server] 사緣 API 서버 시작 · 환경 ${config.envName} · 포트 ${config.port} · 사용자 접속 주소 ${config.publicUrl}`);
  console.log(`[server] 저장소 ${store.kind}${store.kind === 'mssql' ? ` (${config.db.server}/${config.db.database})` : ''} · 화면 모드 ${config.serviceMode} · 관리자 주소 ${config.adminPath}`);
  const S = config.sso;
  const ssoText = {
    iis: `IIS Windows 인증(${S.domain}) → ${S.adLookup ? 'AD 조회' : 'AD 조회 안 함'} → ${S.hrApi.url ? '사내 인사 API' : '인사 API 없음'} · 로그인 헤더는 ${config.trustedProxies.join(', ')} 에서 온 것만${S.devUser ? ` · 개발 시험 계정 ${S.devUser}` : ''}`,
    url: `SSO 주소 ${S.url.replace(/\?.*/, '?…')}`,
    off: '연결 안 됨 — 운영에서는 아무도 들어올 수 없어요 (servers.config.mjs 의 sso)',
  }[S.mode];
  console.log(`[server] 사내 로그인: ${config.serviceMode === 'test' ? 'test 모드라 쓰지 않음' : ssoText}`);
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
