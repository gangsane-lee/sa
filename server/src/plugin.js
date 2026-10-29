/**
 * 사緣 API 를 회사의 다른 iisnode(Express) 앱에 끼워 넣는 입구 — tools/plugin.mjs 가 이 파일을 라이브러리째 하나로 묶어
 * routes/sayeon/index.js 를 만든다. 그 앱의 main.js 에 한 줄만 더하면 된다:
 *
 *     app.use('/sayeon', require('./routes/sayeon'));     // 경로는 servers.config.mjs 의 api.basePath 와 같게
 *
 * 그 앱의 프로세스 안에서 돌기 때문에
 *  - 실패해도 process.exit 하지 않는다 → /sayeon/api 만 503 으로 답하고, 30초 뒤 다음 요청 때 다시 시작해 본다
 *  - 설정은 묶음 폴더의 .env 에서만 읽는다 (runtime.plugin.js — 그 앱의 환경 변수와 섞지 않는다)
 */
import { config, topology } from './config.js';
import { openStore } from './store.js';
import { directory } from './sso.js';
import { initAdmins, isAdmin, verifyAdminPassword } from './admins.js';
import { createApp } from './app.js';

const RETRY_MS = 30_000;
const log = (...a) => console.log('[sayeon]', ...a);
const fail = (...a) => console.error('[sayeon]', ...a);

let ready;
let failedAt = 0;
let reason = '';

async function start() {
  const major = Number(process.versions.node.split('.')[0]);
  if (major < 22) throw new Error(`Node.js ${process.versions.node} — 사緣은 Node.js 22 이상이 필요해요 (그 앱의 web.config nodeProcessCommandLine 확인)`);
  if (topology.problems.length) throw new Error(`기준정보 확인이 필요해요 — ${topology.problems.join(' / ')}`);
  if (config.session.secretMissing) fail('묶음 폴더 .env 의 SESSION_SECRET 이 비어 있어 임시 값을 써요. 앱이 다시 시작하면 모두 로그아웃돼요.');
  const store = await openStore(config);
  await initAdmins();
  const app = await createApp({ config, store, directory, admin: { isAdmin, verify: verifyAdminPassword } });
  log(`시작 · 환경 ${config.envName} · 경로 ${topology.api.basePath || '/'} · 저장소 ${store.kind}${store.kind === 'mssql' ? ` (${config.db.server}/${config.db.database})` : ''} · 사용자 접속 주소 ${config.publicUrl}`);
  return app;
}

function boot() {
  failedAt = 0;
  ready = start();
  ready.catch((e) => {
    failedAt = Date.now();
    reason = e.name === 'DbSetupError' ? e.message : e.message ?? String(e);
    fail(`시작하지 못했어요 — ${e.name === 'DbSetupError' ? e.message : e.stack ?? e}`);
    fail('묶음 폴더의 .env 를 고친 뒤 기다리면(30초) 다음 요청 때 다시 시작해요. 앱 풀을 재시작해도 돼요.');
  });
}
boot();

/** 그 앱에 붙이는 미들웨어 — 시작이 끝날 때까지 요청을 기다리게 한다 */
export default function sayeon(req, res, next) {
  if (failedAt && Date.now() - failedAt > RETRY_MS) boot();
  ready.then(
    (app) => app(req, res, next),
    () => res.status(503).json({ message: '사緣 서버를 시작하지 못했어요. 잠시 뒤 다시 시도해 주세요.', code: 'SERVER_STARTING', ...(config.envName === 'development' && { reason }) }),
  );
}
/** 시작이 끝났는지 (묶음 점검용) */
sayeon.whenReady = () => ready;
