/**
 * 배포 점검 — server 폴더에서  npm run check
 *
 * 실행 환경 · .env 값 · 패키지 · 화면 빌드 · 포트 · DB(연결·권한·테이블·암호화 키) · 관리자 파일 · 사내 로그인 연결을
 * 차례로 확인하고, 문제가 있으면 원인과 해결 방법을 함께 보여준다. 비밀번호·키 값은 출력하지 않는다.
 *   ✔ 정상   ⚠ 지금 막히지는 않지만 운영 전에 정리 권장   ✖ 이대로는 동작하지 않음 (종료 코드 1)
 *
 * 옵션:  npm run check -- --skip-db     DB 확인 건너뛰기
 *        npm run check -- --skip-net    사내 인증 API 연결 확인 건너뛰기
 */
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import crypto from 'node:crypto';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { createReport } from './lib/report.js';

// 라이브러리(mssql 등)는 실행 환경을 확인한 뒤에 불러온다 — Node.js 22.12 + 한글 경로에서는 불러오는 순간 강제 종료되기 때문
const { preflight } = (await import('../preflight.cjs')).default;
const SERVER_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** 운영 표준 버전 (docs/GO-LIVE.md 와 같게) */
const STANDARD = { node: '22.12.0', npm: '10.9.0', pm2: '5.3.0' };
const ROOT = path.resolve(SERVER_ROOT, '..');
const CLIENT = path.join(ROOT, 'client');
const args = new Set(process.argv.slice(2));
const env = process.env;
const r = createReport();
const newKey = () => crypto.randomBytes(32).toString('base64');
const newSecret = () => crypto.randomBytes(32).toString('hex');

const ver = (s) => String(s ?? '').trim().replace(/^v/, '').split('.').map((n) => parseInt(n, 10) || 0);
const cmpVer = (a, b) => {
  const x = ver(a);
  const y = ver(b);
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i];
  return 0;
};
const sh = (cmd) => {
  const out = spawnSync(cmd, { shell: true, encoding: 'utf8', timeout: 20000, windowsHide: true });
  return out.status === 0 ? out.stdout.trim() : null;
};
const BOOL_WORDS = ['1', 'true', 'yes', 'y', 'on', '0', 'false', 'no', 'n', 'off'];
const tcpProbe = (host, port, ms = 5000) =>
  new Promise((resolve) => {
    const s = net.connect({ host, port });
    const done = (res) => {
      s.destroy();
      resolve(res);
    };
    s.setTimeout(ms, () => done({ ok: false, code: 'ETIMEDOUT' }));
    s.once('connect', () => done({ ok: true }));
    s.once('error', (e) => done({ ok: false, code: e.code }));
  });

console.log('\n사緣 배포 점검');
console.log(`  서버 폴더 ${SERVER_ROOT}`);

// ═══ 1. 실행 환경 ═══════════════════════════════════════
r.section('실행 환경 (Node.js · npm · PM2)');
{
  const node = process.versions.node;
  if (cmpVer(node, STANDARD.node) < 0) {
    r.fail(`Node.js ${node} — ${STANDARD.node} 이상이 필요해요`, {
      reason: '화면 빌드 도구(Vite 8)와 서버가 Node.js 22.12 이상에서만 동작해요.',
      fix: [`Node.js ${STANDARD.node} (LTS) 설치: https://nodejs.org/dist/v${STANDARD.node}/ (사내 반입 파일 사용)`],
    });
  } else if (cmpVer(node, STANDARD.node) === 0) r.ok(`Node.js ${node} (운영 표준)`);
  else r.warn(`Node.js ${node} — 운영 표준은 ${STANDARD.node} 이에요`, { reason: '동작은 하지만 검증한 버전과 달라요.', fix: [`가능하면 ${STANDARD.node} 로 맞춰 주세요.`] });

  const ua = /npm\/(\d+\.\d+\.\d+)/.exec(env.npm_config_user_agent ?? '')?.[1];
  const npmVer = ua ?? sh('npm -v');
  if (!npmVer) r.warn('npm 버전을 확인하지 못했어요', { fix: ['npm -v 로 직접 확인해 주세요.'] });
  else if (cmpVer(npmVer, STANDARD.npm) < 0) r.warn(`npm ${npmVer} — 운영 표준은 ${STANDARD.npm} 이에요`, { fix: [`npm install -g npm@${STANDARD.npm}`] });
  else r.ok(`npm ${npmVer}${npmVer === STANDARD.npm ? ' (운영 표준)' : ''}`);

  // PM2는 pm2 명령을 부르면 백그라운드 데몬이 뜰 수 있어, 전역 설치 폴더의 package.json 으로 버전을 읽는다
  const globalRoot = sh('npm root -g');
  let pm2Ver = null;
  try {
    if (globalRoot) pm2Ver = JSON.parse(fs.readFileSync(path.join(globalRoot, 'pm2', 'package.json'), 'utf8')).version;
  } catch {
    /* 없음 */
  }
  if (process.platform === 'win32' && globalRoot && /[^\x20-\x7E]/.test(globalRoot)) {
    const crashes = /^22\.12\./.test(process.versions.node);
    r[crashes ? 'fail' : 'warn'](`전역 npm 폴더에 한글 등 영문이 아닌 글자가 있어요: ${globalRoot}`, {
      reason: crashes
        ? 'Node.js 22.12 는 이런 경로의 패키지(PM2 포함)를 불러오다 강제 종료돼요. 윈도우 사용자 이름이 한글이면 생겨요.'
        : '일부 도구가 이런 경로에서 오동작할 수 있어요.',
      fix: ['npm config set prefix C:\\apps\\npm-global  →  시스템 환경 변수 Path 에 C:\\apps\\npm-global 추가  →  새 창에서 npm install -g pm2@' + STANDARD.pm2],
    });
  }
  if (!pm2Ver) {
    r.warn('PM2를 찾지 못했어요 (전역 npm 폴더 기준)', {
      reason: '서버를 PM2로 띄우려면 전역 설치가 필요해요. (다른 방법으로 설치했다면 무시해도 돼요)',
      fix: [`npm install -g pm2@${STANDARD.pm2}`],
    });
  } else if (pm2Ver !== STANDARD.pm2) {
    r.warn(`PM2 ${pm2Ver} — 운영 표준은 ${STANDARD.pm2} 이에요`, { fix: [`npm install -g pm2@${STANDARD.pm2}  →  pm2 update`] });
  } else r.ok(`PM2 ${pm2Ver} (운영 표준)`);
  r.info(`${os.type()} ${os.release()} · ${os.hostname()}`);
  const pre = preflight();
  for (const p of pre.problems.filter((x) => x.title.startsWith('설치 경로'))) r[p.fatal ? 'fail' : 'warn'](p.title, p);
  if (pre.fatal) process.exit(r.summary({ failText: '이 상태로는 서버와 점검 도구가 라이브러리를 불러오지 못해요. 위 내용을 먼저 고쳐 주세요.' }));
}

const sql = (await import('mssql')).default;
const { config } = await import('../src/config.js');
const { poolConfig, SAFE_DB_NAME, TABLE, __internals } = await import('../src/store.js');
const { makeCipher, ENC_PREFIX } = await import('../src/crypto.js');
const { explainDbError } = await import('../src/dbErrors.js');
const { inspectTable, TABLE_FIX } = await import('./lib/dbinspect.js');

// ═══ 2. 설정 파일 server/.env ═══════════════════════════
r.section('설정 파일 server/.env');
const envFile = path.join(SERVER_ROOT, '.env');
const exampleFile = path.join(SERVER_ROOT, '.env.example');
const keysOf = (file) => {
  try {
    return fs.readFileSync(file, 'utf8').split(/\r?\n/).map((l) => /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=/.exec(l)?.[1]).filter(Boolean);
  } catch {
    return [];
  }
};
if (!fs.existsSync(envFile)) {
  r.fail('server/.env 가 없어요', {
    reason: '서버 주소·DB·키 설정이 없어 기본값으로만 동작해요.',
    fix: ['server 폴더에서  copy .env.example .env  (Linux: cp .env.example .env) 후 값 채우기 — docs/GO-LIVE.md 2-2'],
  });
  process.exit(r.summary({ failText: 'server/.env 를 만든 뒤 다시 실행해 주세요.' }));
}
{
  const known = new Set([...keysOf(exampleFile), 'NODE_ENV']);
  const unknown = keysOf(envFile).filter((k) => !known.has(k));
  if (unknown.length) {
    r.warn(`모르는 항목: ${unknown.join(', ')}`, { reason: '오타면 그 설정은 적용되지 않아요.', fix: ['.env.example 의 항목 이름과 비교해 주세요.'] });
  }
  const isTest = config.serviceMode === 'test';
  const raw = (k) => (env[k] ?? '').trim();

  // 서버
  if (raw('PORT') && !(/^\d+$/.test(raw('PORT')) && +raw('PORT') >= 1 && +raw('PORT') <= 65535)) {
    r.fail(`PORT 값이 숫자가 아니에요: ${raw('PORT')}`, { reason: '잘못된 값이면 3000번으로 떠요.', fix: ['PORT=3000'] });
  } else r.ok(`주소 ${config.host}:${config.port}`);
  let pub = null;
  try {
    pub = new URL(config.publicUrl);
  } catch {
    r.fail(`PUBLIC_URL 형식이 맞지 않아요: ${config.publicUrl}`, { fix: ['예: PUBLIC_URL=http://12.83.18.17:3000'] });
  }
  if (pub) {
    const pubPort = pub.port ? +pub.port : pub.protocol === 'https:' ? 443 : 80;
    if (pubPort !== config.port && !config.trustProxy) {
      r.warn(`PUBLIC_URL 포트(${pubPort})와 PORT(${config.port})가 달라요`, {
        reason: '앞단 프록시 없이 운영하면 사람들이 접속하는 주소와 서버 포트가 같아야 해요.',
        fix: [`PUBLIC_URL=http://12.83.18.17:${config.port}  (프록시를 쓰면 TRUST_PROXY=true)`],
      });
    } else r.ok(`접속 주소 ${config.publicUrl}`);
    if (/^(localhost|127\.)/.test(pub.hostname) && !isTest) r.warn('PUBLIC_URL 이 localhost 예요', { fix: ['PUBLIC_URL=http://12.83.18.17:3000'] });
    const https = pub.protocol === 'https:';
    if (config.session.cookieSecure && !https) {
      r.fail('http 로 접속하는데 COOKIE_SECURE=true 예요', {
        reason: '브라우저가 http 에서는 보안 쿠키를 저장하지 않아 로그인해도 바로 풀려요.',
        fix: ['COOKIE_SECURE=false (https 를 붙이면 true)'],
      });
    } else if (https && !config.session.cookieSecure) {
      r.warn('https 로 접속하는데 COOKIE_SECURE=false 예요', { fix: ['COOKIE_SECURE=true'] });
    }
  }

  // 화면 운영
  if (!['test', 'open'].includes(raw('SERVICE_MODE') || 'open')) {
    r.fail(`SERVICE_MODE 값이 맞지 않아요: ${raw('SERVICE_MODE')}`, { reason: 'test 가 아니면 모두 open 으로 동작해요.', fix: ['SERVICE_MODE=open (정식) 또는 test (시연)'] });
  } else r.ok(`화면 모드 ${config.serviceMode}${isTest ? ' — 시연: 데이터가 각자 브라우저에만 저장되고 DB를 쓰지 않아요' : ' — 정식 운영'}`);
  const RESERVED = ['/', '/login', '/apply', '/me', '/saju', '/messages', '/voc', '/privacy', '/api', '/assets', '/sayeon.config.js', '/favicon.svg'];
  if (!/^\/?[A-Za-z0-9_-]+\/?$/.test(raw('ADMIN_PATH') || '/admin')) {
    r.fail(`ADMIN_PATH 는 한 단어 경로여야 해요: ${raw('ADMIN_PATH')}`, { fix: ['예: ADMIN_PATH=/changeme (영문·숫자·-·_)'] });
  } else if (RESERVED.includes(config.adminPath.toLowerCase())) {
    r.fail(`ADMIN_PATH(${config.adminPath})가 사용자 화면 주소와 겹쳐요`, { fix: ['겹치지 않는 주소로 바꿔 주세요. 예: /changeme'] });
  } else r.ok(`관리자 주소 ${config.adminPath}`);

  // 세션 · 암호화
  if (config.session.secretMissing) {
    r.warn('SESSION_SECRET 이 비어 있어요', { reason: '서버를 다시 켤 때마다 모두 로그아웃돼요.', fix: [`SESSION_SECRET=${newSecret()}`] });
  } else if (raw('SESSION_SECRET').length < 32) {
    r.warn('SESSION_SECRET 이 짧아요 (32자 이상 권장)', { fix: [`SESSION_SECRET=${newSecret()}`] });
  } else r.ok('SESSION_SECRET 설정됨');
  if (!config.dataKey) {
    r[isTest ? 'warn' : 'fail']('DATA_KEY 가 비어 있어요', {
      reason: "이름·메일이 평문으로 저장돼요. 홈의 '개인정보는 암호화해 보관해요' 약속과 맞지 않아요.",
      fix: [`DATA_KEY=${newKey()}  (한 번 정하면 바꾸지 말고 따로 보관)`],
    });
  } else if (Buffer.from(config.dataKey, 'base64').length !== 32) {
    r.fail('DATA_KEY 형식이 맞지 않아요 (base64 32바이트)', { reason: '서버가 시작하지 못해요.', fix: [`새로 정할 때: DATA_KEY=${newKey()}  (이미 데이터가 있으면 예전 키를 그대로 넣어야 해요)`] });
  } else r.ok('DATA_KEY 설정됨 (base64 32바이트)');

  // 저장소
  if (!['mssql', 'memory'].includes(config.store)) {
    r.fail(`STORE 값이 맞지 않아요: ${config.store}`, { fix: ['STORE=mssql'] });
  } else if (config.store === 'memory') {
    r[isTest ? 'warn' : 'fail']('STORE=memory — 서버를 다시 켜면 데이터가 모두 사라져요', { fix: ['운영은 STORE=mssql'] });
  }
  for (const k of ['DB_ENCRYPT', 'DB_TRUST_CERT', 'DB_AUTO_CREATE', 'COOKIE_SECURE', 'TRUST_PROXY']) {
    if (raw(k) && !BOOL_WORDS.includes(raw(k).toLowerCase())) r.warn(`${k} 값은 true 또는 false 로 적어 주세요: ${raw(k)}`, { reason: '알 수 없는 값은 false 로 처리돼요.' });
  }
  if (raw('DB_ADMIN_USER') || raw('DB_ADMIN_PASSWORD')) {
    r.warn('DB_ADMIN_USER · DB_ADMIN_PASSWORD 가 남아 있어요', { reason: '관리 계정 비밀번호는 DB 준비(npm run db:setup) 때만 필요해요.', fix: ['DB 준비가 끝났으면 .env 에서 지워 주세요.'] });
  }
  if (raw('SSO_TIMEOUT_MS') && !/^\d+$/.test(raw('SSO_TIMEOUT_MS'))) r.warn(`SSO_TIMEOUT_MS 는 숫자(밀리초)로: ${raw('SSO_TIMEOUT_MS')}`);
}

// ═══ 3. 패키지 ═════════════════════════════════════════
r.section('패키지 (npm ci)');
{
  const pkg = JSON.parse(fs.readFileSync(path.join(SERVER_ROOT, 'package.json'), 'utf8'));
  const req = createRequire(path.join(SERVER_ROOT, 'package.json'));
  const missing = Object.keys(pkg.dependencies ?? {}).filter((d) => {
    try {
      req.resolve(`${d}/package.json`);
      return false;
    } catch {
      return !fs.existsSync(path.join(SERVER_ROOT, 'node_modules', d));
    }
  });
  if (missing.length) r.fail(`server 패키지가 없어요: ${missing.join(', ')}`, { fix: ['server 폴더에서  npm ci'] });
  else r.ok('server 패키지 설치됨');
  // 서버는 client/src 의 업무 규칙을 함께 쓰고, 그 코드가 client/node_modules 의 사주 계산 라이브러리를 부른다
  try {
    createRequire(path.join(CLIENT, 'src', 'utils', 'saju.js')).resolve('lunar-javascript');
    r.ok('client 패키지 설치됨 (서버가 함께 쓰는 사주 계산 라이브러리 포함)');
  } catch {
    r.fail('client 패키지가 없어요', {
      reason: '서버가 client/src 의 업무 규칙을 함께 쓰는데, 그 코드가 client/node_modules 의 라이브러리를 불러요. 없으면 서버가 시작하지 못해요.',
      fix: ['client 폴더에서  npm ci'],
    });
  }
}

// ═══ 4. 화면 빌드 ══════════════════════════════════════
r.section('화면 빌드 (client/dist)');
{
  const dist = config.clientDist;
  const indexHtml = path.join(dist, 'index.html');
  if (!fs.existsSync(indexHtml)) {
    r.fail(`화면 빌드가 없어요: ${dist}`, { reason: '접속하면 "화면 빌드가 없어요" 문구만 나와요.', fix: ['client 폴더에서  npm run build'] });
  } else {
    const builtAt = fs.statSync(indexHtml).mtimeMs;
    r.ok(`있음 · ${new Date(builtAt).toLocaleString('ko-KR')} 빌드`);
    const assets = path.join(dist, 'assets');
    const jsFiles = fs.existsSync(assets) ? fs.readdirSync(assets).filter((f) => f.endsWith('.js')).map((f) => path.join(assets, f)) : [];
    const bundle = jsFiles.map((f) => fs.readFileSync(f, 'utf8')).join('\n');

    // 빌드 이후 바뀐 화면 코드
    const newest = (p) => {
      if (!fs.existsSync(p)) return 0;
      const st = fs.statSync(p);
      if (!st.isDirectory()) return st.mtimeMs;
      return Math.max(0, ...fs.readdirSync(p).filter((n) => n !== 'node_modules').map((n) => newest(path.join(p, n))));
    };
    const srcAt = Math.max(...['src', 'public', 'index.html', '.env.production', 'vite.config.js'].map((p) => newest(path.join(CLIENT, p))));
    if (srcAt > builtAt + 1000) {
      r.warn('빌드한 뒤에 화면 코드·설정이 바뀌었어요', { reason: '지금 화면에는 바뀐 내용이 반영되어 있지 않아요.', fix: ['client 폴더에서  npm run build  (서버 재시작은 필요 없어요)'] });
    }

    // 시연용 가짜 데이터가 빌드에 들어 있는지 (VITE_INCLUDE_MOCK)
    const mockIn = bundle.includes('sayeon.mock.db');
    if (config.serviceMode === 'test' && !mockIn) {
      r.fail('SERVICE_MODE=test 인데 시연용 코드가 빠진 빌드예요', {
        reason: 'VITE_INCLUDE_MOCK=false 로 빌드하면 test 모드를 쓸 수 없어 open 으로 동작해요.',
        fix: ['client/.env.production 의 VITE_INCLUDE_MOCK=true 로 바꾸고 다시 빌드, 또는 SERVICE_MODE=open'],
      });
    } else if (config.serviceMode === 'open' && mockIn) {
      r.warn('정식 운영인데 시연용 코드(테스트 계정·가짜 데이터)가 빌드에 들어 있어요', {
        reason: '동작에는 문제없지만 화면 코드에 테스트 계정 정보가 남아요.',
        fix: ['client/.env.production 의 VITE_INCLUDE_MOCK=false 로 바꾸고  npm run build'],
      });
    } else r.ok(`빌드 종류: ${mockIn ? '시연용(가짜 데이터 포함)' : '정식 운영용(가짜 데이터 없음)'}`);

    // DevExtreme 라이선스
    const licFile = path.join(CLIENT, 'src', '.devextreme', 'license-key.js');
    const key = fs.existsSync(licFile) ? /licenseKey = '([^']+)'/.exec(fs.readFileSync(licFile, 'utf8'))?.[1] : null;
    if (!key || key === 'TRIAL') {
      r.warn('DevExtreme 라이선스 키 파일이 없어요', {
        reason: '화면 맨 위에 평가판 배너가 떠요.',
        fix: ['키 파일(client/src/.devextreme/license-key.js)을 만들거나 작업 PC에서 복사한 뒤  npm run build — docs/GO-LIVE.md 5-2'],
      });
    } else if (!bundle.includes(key.slice(0, 40))) {
      r.warn('라이선스 키 파일은 있는데 빌드에 들어가지 않았어요', { reason: '키 파일을 만들기 전에 빌드했어요.', fix: ['client 폴더에서  npm run build'] });
    } else r.ok('DevExtreme 라이선스 키 포함');
  }
}

// ═══ 5. 포트 ══════════════════════════════════════════
r.section(`포트 ${config.port}`);
{
  const state = await new Promise((resolve) => {
    const srv = net.createServer();
    srv.once('error', (e) => resolve(e.code));
    srv.listen(config.port, config.host, () => srv.close(() => resolve('free')));
  });
  if (state === 'free') r.ok('비어 있어요 — 서버를 시작할 수 있어요');
  else if (state === 'EADDRINUSE') {
    const health = await fetch(`http://127.0.0.1:${config.port}/api/health`, { signal: AbortSignal.timeout(3000) })
      .then((res) => res.json())
      .catch(() => null);
    if (health?.ok) r.ok(`사緣 서버가 이미 이 포트에서 실행 중이에요 (저장소 ${health.store})`);
    else {
      r.fail(`다른 프로그램이 ${config.port}번 포트를 쓰고 있어요`, {
        fix: [`어떤 프로그램인지 확인: netstat -ano | findstr :${config.port}  (Linux: ss -ltnp | grep ${config.port})`, '그 프로그램을 끄거나 .env 의 PORT 를 바꿔 주세요 (방화벽도 함께)'],
      });
    }
  } else if (state === 'EACCES') r.fail(`${config.port}번 포트를 열 권한이 없어요`, { fix: ['1024 이상 포트(예: 3000)를 쓰거나 관리자 권한으로 실행해 주세요.'] });
  else if (state === 'EADDRNOTAVAIL') r.fail(`HOST(${config.host}) 주소가 이 서버에 없어요`, { fix: ['HOST=0.0.0.0'] });
  else r.warn(`포트 확인 실패: ${state}`);
}

// ═══ 6. DB ════════════════════════════════════════════
r.section('DB (MSSQL)');
if (args.has('--skip-db')) r.info('--skip-db — 건너뛰었어요');
else if (config.store !== 'mssql') r.info(`STORE=${config.store} — DB를 쓰지 않아요`);
else {
  const c = config.db;
  const ctx = { host: c.server, port: c.port, user: c.user, database: c.database };
  let master;
  let pool;
  try {
    if (!c.user || !c.password) throw Object.assign(new Error('skip'), { skip: 'DB_USER · DB_PASSWORD 를 채워 주세요.' });
    if (!SAFE_DB_NAME.test(c.database)) throw Object.assign(new Error('skip'), { skip: `DB_NAME 은 영문·숫자·_ 만: ${c.database}` });
    r.info(`${c.server}:${c.port} · DB ${c.database} · 계정 ${c.user}`);

    // ① 네트워크 — 로그인 전에 포트가 열려 있는지만 본다 (원인을 나누기 위해)
    const probe = await tcpProbe(c.server, c.port);
    if (!probe.ok) {
      r.failDb(explainDbError({ message: probe.code }, ctx));
      throw Object.assign(new Error('skip'), { skip: null });
    }
    r.ok(`네트워크: ${c.server}:${c.port} 열려 있음`);

    // ② 로그인
    try {
      master = await new sql.ConnectionPool(poolConfig(c, 'master', { timeoutMs: 10000 })).connect();
    } catch (e) {
      r.failDb(explainDbError(e, ctx));
      throw Object.assign(new Error('skip'), { skip: null });
    }
    const s = (await master.request().input('n', sql.NVarChar(128), c.database).query(`
      SELECT CAST(SERVERPROPERTY('ProductVersion') AS NVARCHAR(50)) AS ver,
             IS_SRVROLEMEMBER('sysadmin') AS sysadmin,
             HAS_PERMS_BY_NAME(NULL, NULL, 'CREATE ANY DATABASE') AS canCreateDb,
             DB_ID(@n) AS dbId`)).recordset[0];
    r.ok(`로그인 성공 · SQL Server ${s.ver}`);
    if (s.sysadmin) {
      r.warn(`${c.user} 은(는) sysadmin(최고 관리자) 계정이에요`, {
        reason: '서버가 쓰는 계정 비밀번호가 새면 DB 서버 전체가 위험해요.',
        fix: ['전용 계정 권장: npm run db:setup (docs/GO-LIVE.md 3단계)'],
      });
    }

    // ③ 데이터베이스
    if (s.dbId === null) {
      if (c.autoCreate && s.canCreateDb) r.ok(`DB ${c.database} 가 아직 없어요 — 서버를 처음 켤 때 만들어요 (DB_AUTO_CREATE=true)`);
      else {
        r.fail(`DB ${c.database} 가 없어요`, {
          reason: c.autoCreate ? `계정 ${c.user} 에 DB를 만들 권한이 없어요.` : 'DB_AUTO_CREATE=false 라 서버가 만들지 않아요.',
          fix: ['관리 계정으로  npm run db:setup  또는 DB 담당자에게 server/sql/setup.sql 실행 요청'],
        });
      }
    } else {
      try {
        pool = await new sql.ConnectionPool(poolConfig(c, c.database, { timeoutMs: 10000 })).connect();
      } catch (e) {
        r.failDb(explainDbError(e, ctx));
        throw Object.assign(new Error('skip'), { skip: null });
      }
      r.ok(`DB ${c.database} 접속`);
      const run = async (q) => (await pool.request().query(q)).recordset;

      // ④ 테이블
      const t = await inspectTable(run);
      if (!t.exists) {
        const p = (await run(`SELECT HAS_PERMS_BY_NAME(DB_NAME(), 'DATABASE', 'CREATE TABLE') AS ct, HAS_PERMS_BY_NAME('dbo', 'SCHEMA', 'ALTER') AS sa`))[0];
        if (p.ct && p.sa) r.ok(`테이블 ${TABLE} 이 아직 없어요 — 서버를 처음 켤 때 만들어요`);
        else r.fail(`테이블 ${TABLE} 이 없고, 계정 ${c.user} 에 만들 권한도 없어요`, { fix: ['관리 계정으로  npm run db:setup'] });
      } else if (t.problems.length) {
        r.fail('테이블 구조가 서버가 기대하는 모양과 달라요', { reason: t.problems.join(' · '), fix: [TABLE_FIX] });
      } else {
        r.ok(`테이블 ${TABLE} · 문서 ${t.count}건`);
        // ⑤ 권한
        const p = (await run(`SELECT
            HAS_PERMS_BY_NAME(N'${TABLE}', 'OBJECT', 'SELECT') AS s, HAS_PERMS_BY_NAME(N'${TABLE}', 'OBJECT', 'INSERT') AS i,
            HAS_PERMS_BY_NAME(N'${TABLE}', 'OBJECT', 'UPDATE') AS u, HAS_PERMS_BY_NAME(N'${TABLE}', 'OBJECT', 'DELETE') AS d`))[0];
        const lack = [['읽기', p.s], ['추가', p.i], ['수정', p.u], ['삭제', p.d]].filter(([, v]) => !v).map(([k]) => k);
        if (lack.length) r.fail(`계정 ${c.user} 에 ${lack.join('·')} 권한이 없어요`, { fix: ['관리 계정으로  npm run db:setup  (db_datareader · db_datawriter)'] });
        else r.ok('읽기·추가·수정·삭제 권한 있음');

        // ⑥ 암호화 키가 저장된 데이터와 맞는지
        const rows = await run(`SELECT TOP (200) COLL, DOC_ID, BODY FROM ${TABLE} WHERE COLL IN ('applicants', 'employees', 'vocs')`);
        const cipher = (() => {
          try {
            return makeCipher(config.dataKey);
          } catch {
            return null; // 형식 오류는 2번에서 이미 알렸다
          }
        })();
        if (cipher && rows.length) {
          let enc = 0;
          let plain = 0;
          let bad = 0;
          for (const row of rows) {
            const o = JSON.parse(row.BODY);
            for (const f of __internals.SECRET[row.COLL] ?? []) {
              if (typeof o[f] !== 'string' || !o[f]) continue;
              if (!o[f].startsWith(ENC_PREFIX)) plain += 1;
              else {
                enc += 1;
                try {
                  if (!cipher.enabled) throw new Error('no key');
                  cipher.dec(o[f]);
                } catch {
                  bad += 1;
                }
              }
            }
          }
          if (bad) {
            r.fail(cipher.enabled ? 'DATA_KEY 가 저장된 데이터를 암호화한 키와 달라요' : 'DATA_KEY 가 비어 있는데 DB에는 암호화된 데이터가 있어요', {
              reason: `암호화된 이름·메일 ${bad}건을 풀지 못했어요. 이대로 켜면 서버가 시작하지 못해요.`,
              fix: ['처음 쓰던 DATA_KEY 를 그대로 넣어 주세요. (키를 잃어버렸다면 이름·메일은 복구할 수 없어요)'],
            });
          } else if (cipher.enabled && plain) {
            r.warn(`암호화되지 않은 이름·메일 ${plain}건이 있어요`, { reason: 'DATA_KEY 를 넣기 전에 저장된 데이터예요. 해당 신청서가 바뀌어 저장될 때 암호화돼요.' });
          } else if (enc) r.ok(`DATA_KEY 확인 — 암호화된 데이터 ${enc}건을 풀 수 있어요`);
        }
      }
    }
  } catch (e) {
    if (e.skip) r.fail(e.skip);
    else if (e.skip !== null) r.failDb(explainDbError(e, ctx));
  } finally {
    await master?.close().catch(() => {});
    await pool?.close().catch(() => {});
  }
}

// ═══ 7. 관리자 계정 ════════════════════════════════════
r.section('관리자 계정 (server/config/admins.js)');
{
  const file = path.join(SERVER_ROOT, 'config', 'admins.js');
  if (!fs.existsSync(file)) {
    r.fail('파일이 없어요', { reason: '관리자 화면에 아무도 들어갈 수 없어요.', fix: ['server/config 에서  copy admins.example.js admins.js  후 채우기'] });
  } else {
    let a = null;
    try {
      a = (await import(`${pathToFileURL(file).href}?t=${Date.now()}`)).default ?? {};
    } catch (e) {
      r.fail('파일을 읽지 못했어요 (문법 오류)', { reason: e.message, fix: ['따옴표·쉼표·괄호를 admins.example.js 와 비교해 주세요.'] });
    }
    if (a) {
      const list = Array.isArray(a.accounts) ? a.accounts : [];
      const valid = list.filter((x) => String(x?.empNo ?? '').trim() || String(x?.adId ?? '').trim());
      if (!valid.length) r.fail('관리자 계정(accounts)이 비어 있어요', { reason: '관리자 화면에 아무도 들어갈 수 없어요.', fix: ["accounts 에 매칭 담당자의 사번(empNo) 또는 사내 계정 ID(adId)를 넣어 주세요."] });
      else r.ok(`관리자 계정 ${valid.length}개`);
      if (valid.length && list.length > valid.length) r.warn(`사번·계정 ID가 모두 빈 항목 ${list.length - valid.length}개는 무시돼요`);
      if (a.passwordHash) {
        if (/^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/.test(a.passwordHash)) r.ok('관리자 비밀번호: 해시 방식');
        else r.fail('passwordHash 형식이 맞지 않아요', { reason: '관리자 비밀번호 확인이 항상 실패해요.', fix: ['npm run hash-password -- "새 비밀번호"  출력값을 그대로 붙여넣기'] });
      } else if (a.password) {
        r.warn('관리자 비밀번호: 평문 방식', { reason: '이 파일이 새면 비밀번호가 그대로 보여요.', fix: ['npm run hash-password -- "새 비밀번호"  → passwordHash 에 붙여넣고 password 는 비우기'] });
        if (String(a.password).length < 8) r.warn('관리자 비밀번호가 8자보다 짧아요');
      } else r.fail('관리자 비밀번호가 비어 있어요', { reason: '관리자 화면에 들어갈 수 없어요.', fix: ['npm run hash-password -- "새 비밀번호"'] });
    }
  }
}

// ═══ 8. 사내 로그인 (SSO / AD) ══════════════════════════
r.section('사내 로그인 (SSO / AD)');
{
  const S = config.sso;
  const isTest = config.serviceMode === 'test';
  if (isTest) r.info('test 모드 — 화면이 가짜 계정으로 로그인해요. 아래는 정식 오픈 때 필요한 항목이에요');
  const severity = isTest ? 'warn' : 'fail';
  if (!['off', 'header', 'api'].includes(S.mode)) r.fail(`SSO_MODE 값이 맞지 않아요: ${S.mode}`, { fix: ['SSO_MODE=off · header · api 중 하나'] });
  else r.ok(`SSO_MODE=${S.mode}`);
  if (!S.loginUrl && S.mode === 'off') {
    r[severity]('로그인 방법이 하나도 연결되지 않았어요', {
      reason: 'AUTH_LOGIN_URL 이 비어 있고 SSO 도 꺼져 있어 아무도 로그인할 수 없어요.',
      fix: ['AUTH_LOGIN_URL 에 사내 ID/비밀번호 확인 API 주소를 넣거나 SSO_MODE 를 설정 — docs/GO-LIVE.md 4-2'],
    });
  } else if (!S.loginUrl) {
    r.warn('AUTH_LOGIN_URL 이 비어 있어요', { reason: 'SSO 가 실패했을 때 쓸 로그인 화면이 동작하지 않아요.' });
  }
  if (S.mode === 'header') {
    if (!S.proxySecret) r[severity]('SSO_MODE=header 인데 SSO_PROXY_SECRET 이 비어 있어요', { reason: '헤더를 꾸민 요청을 막을 수 없어 SSO 자동 로그인이 꺼져 있어요.', fix: ['앞단 프록시와 같은 비밀값을 넣어 주세요.'] });
    if (!S.lookupUrl) r.warn('HR_LOOKUP_URL 이 비어 있어요', { reason: '헤더의 사번만으로 들어와 이름·성별·사업부가 비어요.' });
  }
  if (S.mode === 'api') {
    if (!S.tokenCookie || !S.verifyUrl) r[severity]('SSO_MODE=api 에 필요한 값이 비어 있어요', { fix: ['SSO_TOKEN_COOKIE · SSO_VERIFY_URL'] });
    if (/^\d+\.\d+\.\d+\.\d+$/.test(URL.canParse(config.publicUrl) ? new URL(config.publicUrl).hostname : '')) {
      r.warn('IP 주소로 접속하면 사내 SSO 쿠키가 전달되지 않아요', { fix: ['사내 DNS 이름을 받아 그 주소로 접속해 주세요 (PUBLIC_URL 도 함께)'] });
    }
  }
  if (S.lookupUrl && !/\{(empNo|id)\}/.test(S.lookupUrl)) r.warn('HR_LOOKUP_URL 에 {empNo} 자리가 없어요', { fix: ['예: https://hr.사내/api/emp/{empNo}'] });
  if (S.searchUrl && !/\{q\}/.test(S.searchUrl)) r.warn('HR_SEARCH_URL 에 {q} 자리가 없어요');

  const urls = [['AUTH_LOGIN_URL', S.loginUrl], ['SSO_VERIFY_URL', S.verifyUrl], ['HR_LOOKUP_URL', S.lookupUrl], ['HR_SEARCH_URL', S.searchUrl]].filter(([, v]) => v);
  for (const [name, value] of urls) {
    let u;
    try {
      u = new URL(value.replace(/\{(empNo|id|q)\}/g, 'x'));
    } catch {
      r.fail(`${name} 형식이 맞지 않아요: ${value}`);
      continue;
    }
    if (args.has('--skip-net')) continue;
    const port = +u.port || (u.protocol === 'https:' ? 443 : 80);
    const p = await tcpProbe(u.hostname, port, 4000);
    if (p.ok) r.ok(`${name}: ${u.hostname}:${port} 연결 가능`);
    else {
      r.warn(`${name}: ${u.hostname}:${port} 에 연결하지 못했어요 (${p.code})`, {
        reason: p.code === 'ENOTFOUND' ? '주소 이름을 찾지 못했어요.' : '방화벽에 막혔거나 주소가 틀렸을 수 있어요.',
        fix: ['API 서버(12.83.18.17)에서 사내 인증 서버로 나가는 방화벽을 확인해 주세요.'],
      });
    }
  }
}

process.exit(
  r.summary({
    okText: '시작할 준비가 됐어요 →  pm2 start ecosystem.config.cjs  (이미 실행 중이면  pm2 restart sayeon-api)',
    failText: '✖ 항목을 고친 뒤 다시  npm run check  해 주세요. (자세한 순서: docs/GO-LIVE.md)',
  }),
);
