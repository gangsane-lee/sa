/**
 * 사緣 API 를 회사의 다른 iisnode(Express) 앱에 끼워 넣는 입구 — tools/plugin.mjs 가 이 파일을 라이브러리째 하나로 묶어
 * routes/sayeon/index.js 를 만든다. 그 앱의 main.js 에 한 줄만 더하면 된다:
 *
 *     app.use('/sayeon', require('./routes/sayeon')({ db: 그앱의mssql설정 }));   // DB 계정을 그 앱 것으로
 *     app.use('/sayeon', require('./routes/sayeon'));                          // DB 계정을 묶음 폴더 .env 로
 *   경로는 servers.config.mjs 의 api.basePath 와 같게. 그 앱의 CORS·로그인 미들웨어보다 앞에 둔다
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
/** 그 앱 main.js 가 넘겨준 설정 — { db: 그 앱의 mssql 설정 } */
let hostOptions = {};

/**
 * 그 앱의 mssql 설정({ server, port, user, password, options, authentication … })으로 사緣 DB 접속을 정한다.
 * DB 이름은 사緣 것(servers.config.mjs 의 db.name)을 쓴다 — 바꾸려면 { db, database: '이름' }
 */
function applyHostDb({ db, database } = {}) {
  if (!db || typeof db !== 'object') return;
  const d = config.db;
  if (db.server) d.server = String(db.server);
  if (db.port) d.port = Number(db.port);
  if (db.user !== undefined) d.user = String(db.user);
  if (db.password !== undefined) d.password = String(db.password);
  if (db.domain) d.domain = String(db.domain);
  if (db.authentication) d.authentication = db.authentication;
  if (db.options && typeof db.options === 'object') {
    const { database: _ignored, ...opts } = db.options;
    d.options = opts;
    if (opts.encrypt !== undefined) d.encrypt = Boolean(opts.encrypt);
    if (opts.trustServerCertificate !== undefined) d.trustServerCertificate = Boolean(opts.trustServerCertificate);
  }
  if (database) d.database = String(database);
  d.autoCreate = false; // 그 앱 계정으로는 DB 를 새로 만들지 않는다 (표만 없으면 만든다)
}

async function start() {
  const major = Number(process.versions.node.split('.')[0]);
  if (major < 22) throw new Error(`Node.js ${process.versions.node} — 사緣은 Node.js 22 이상이 필요해요 (그 앱의 web.config nodeProcessCommandLine 확인)`);
  if (topology.problems.length) throw new Error(`기준정보 확인이 필요해요 — ${topology.problems.join(' / ')}`);
  if (config.session.secretMissing) fail('묶음 폴더 .env 의 SESSION_SECRET 이 비어 있어 임시 값을 써요. 앱이 다시 시작하면 모두 로그아웃돼요.');
  applyHostDb(hostOptions);
  const store = await openStore(config);
  await initAdmins();
  const app = await createApp({ config, store, directory, admin: { isAdmin, verify: verifyAdminPassword } });
  log(`시작 · 경로 ${topology.api.basePath || '/'} · 저장소 ${store.kind}${store.kind === 'mssql' ? ` (${config.db.server}/${config.db.database}${hostOptions.db ? ' · 그 앱 DB 계정' : ''})` : ''} · 사용자 접속 주소 ${config.publicUrl}`);
  return app;
}

function boot() {
  failedAt = 0;
  ready = start();
  ready.catch((e) => {
    failedAt = Date.now();
    reason = e.name === 'DbSetupError' ? e.message : e.message ?? String(e);
    fail(`시작하지 못했어요 — ${e.name === 'DbSetupError' ? e.message : e.stack ?? e}`);
    fail('묶음 폴더의 .env (또는 그 앱이 넘긴 DB 설정)를 고친 뒤 기다리면(30초) 다음 요청 때 다시 시작해요. 앱 풀을 재시작해도 돼요.');
  });
}

/** 시작은 처음 한 번 — 설정을 넘겨받으면 그때, 아니면 첫 요청 때 */
const ensureBoot = () => {
  if (!ready) boot();
  else if (failedAt && Date.now() - failedAt > RETRY_MS) boot();
  return ready;
};

function handle(req, res, next) {
  ensureBoot().then(
    (app) => app(req, res, next),
    () => res.status(503).json({ message: '사緣 서버를 시작하지 못했어요. 잠시 뒤 다시 시도해 주세요.', code: 'SERVER_STARTING' }), // 원인은 로그에만
  );
}

/**
 * 그 앱에 붙이는 미들웨어
 *  app.use('/sayeon', sayeon)                     — 그대로 미들웨어로
 *  app.use('/sayeon', sayeon({ db: mssql설정 }))   — 그 앱의 DB 접속 설정을 넘기고 미들웨어를 받는다
 */
export default function sayeon(reqOrOptions, res, next) {
  if (res === undefined && next === undefined) {
    if (ready) fail('설정은 처음 한 번만 넘길 수 있어요 — main.js 에서 require(…)(…) 를 한 번만 불러 주세요');
    else {
      hostOptions = reqOrOptions && typeof reqOrOptions === 'object' ? reqOrOptions : {};
      boot();
    }
    return handle;
  }
  return handle(reqOrOptions, res, next);
}
/** 시작이 끝났는지 (묶음 점검용) */
sayeon.whenReady = () => ensureBoot();
