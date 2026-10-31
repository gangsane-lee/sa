/**
 * 사緣 API 서버 시작점 — main.js(IIS + iisnode, 또는 node main.js)가 이 파일을 연다.
 */
import { config, topology } from './config.js';
import { openStore } from './store.js';
import { directory } from './sso.js';
import { initAdmins, isAdmin, canEnterAdmin, adminPasswordSet, verifyAdminPassword } from './admins.js';
import { createApp } from './app.js';

if (config.session.secretMissing) {
  console.warn('[server] SESSION_SECRET 이 비어 있어 임시 값을 써요. 서버를 다시 켜면 모두 로그아웃돼요. .env 에 채워 주세요.');
}

if (topology.problems.length) {
  console.error('[server] 기준정보(servers.config.mjs · web.config) 확인이 필요해요:');
  for (const p of topology.problems) console.error(`  - ${p}`);
  console.error('[server] 고친 뒤 이 폴더에서  npm run check  → IIS 앱 풀 재시작 (web.config 를 고치면 자동으로 다시 시작)');
  process.exit(1);
}

let store;
try {
  store = await openStore(config);
} catch (e) {
  // 원인·해결이 담긴 문구를 남기고 끝낸다 (iisnode 는 다음 요청 때 다시 띄운다 — 로그는 이 폴더의 iisnode)
  console.error(`[server] 시작하지 못했어요 — ${e.name === 'DbSetupError' ? e.message : e.stack ?? e}`);
  console.error('[server] 설정을 고친 뒤 이 폴더에서  npm run check  로 확인하고 IIS 앱 풀 재시작');
  process.exit(1);
}
await initAdmins();
const app = await createApp({
  config,
  store,
  directory,
  admin: { isAdmin, canEnter: canEnterAdmin, passwordSet: adminPasswordSet, verify: verifyAdminPassword },
});

// iisnode 로 돌면 iisnode 가 넘겨 준 파이프(PORT)로, 아니면 포트로 연다
const onListen = () => {
  console.log(`[server] 사緣 API 서버 시작 · 환경 ${config.envName} · ${config.listen ? `IIS + iisnode (사이트 포트 ${config.port})` : `포트 ${config.port}`} · 사용자 접속 주소 ${config.publicUrl}`);
  console.log(`[server] 저장소 ${store.kind}${store.kind === 'mssql' ? ` (${config.db.server}/${config.db.database})` : ''} · 관리자 주소 ${config.adminPath}`);
  const S = config.sso;
  const ssoText = {
    browser: `브라우저가 사내 인사정보 URL 로 확인 → ${S.hrApi.url ? '이 서버가 사내 인사 API 로 사번 재확인' : '사번 재확인 없음(sso.hrApi.url 비어 있음)'}`,
    iis: `IIS Windows 인증(${S.domain}) → ${S.adLookup ? 'AD 조회' : 'AD 조회 안 함'} → ${S.hrApi.url ? '사내 인사 API' : '인사 API 없음'} · 로그인 헤더는 ${config.trustedProxies.join(', ')} 에서 온 것만${S.devUser ? ` · 개발 시험 계정 ${S.devUser}` : ''}`,
    url: `SSO 주소 ${S.url.replace(/\?.*/, '?…')}`,
    off: '연결 안 됨 — 운영에서는 아무도 들어올 수 없어요 (servers.config.mjs 의 sso)',
  }[S.mode];
  console.log(`[server] 사내 로그인: ${ssoText}`);
};
const server = config.listen ? app.listen(config.listen, onListen) : app.listen(config.port, config.host, onListen);

// 종료 신호(Ctrl+C 등)를 받으면 진행 중인 저장을 마치고 끝낸다 (iisnode 는 응답마다 저장이 끝난 뒤라 바로 꺼도 안전)
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
