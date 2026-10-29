/**
 * 배포 패키지 만들기 — 개발 서버(인터넷 되는 곳)에서 실행:  server 폴더에서  npm run release
 *   npm run release -- --env development     개발 환경용
 *   npm run release -- --zip                 폴더와 함께 .zip 도 만든다
 *
 * 만드는 것: release/<빌드번호>-<환경>/
 *   web/   Web 서버(IIS) 사이트 폴더에 그대로 복사할 화면 파일 + web.config + _deploy/(점검·배포 스크립트)
 *   api/   API 서버(IIS + iisnode) 사이트 폴더에 그대로 복사할 폴더 — main.js · web.config(환경·포트·DB) · routes/ ·
 *          src/ · shared/(업무 규칙) · node_modules(오프라인 설치용) · servers.config.mjs · _deploy/deploy-api.ps1
 *   routes/  (servers.config.mjs 의 api.basePath 가 있을 때 api/ 대신) 회사의 다른 iisnode 앱 routes 폴더에 복사할
 *            사緣 묶음 — 라이브러리까지 한 파일(index.js). tools/plugin.mjs
 *   배포안내.txt   이 빌드의 순서·점검 명령
 * 각 단계마다 확인하고, 문제가 있으면 원인·해결을 보여주고 멈춘다. (.env · admins.js · 라이선스 키는 넣지 않는다)
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadTopology } from './topology.mjs';
import { buildApiWebConfig } from '../server/scripts/lib/webconfig.js';
import { buildPlugin, smokeTestPlugin, pluginFolderOf } from './plugin.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const target = argv.includes('--env') ? argv[argv.indexOf('--env') + 1] : 'production';
const FORCE = argv.includes('--force');
const ZIP = argv.includes('--zip');
let n = 0;
const step = (t) => console.log(`\n[${++n}] ${t}`);
const ok = (m) => console.log(`  ✔ ${m}`);
const warn = (m) => console.log(`  ⚠ ${m}`);
const stop = (m, fix) => {
  console.log(`  ✖ ${m}`);
  for (const f of [fix ?? []].flat()) console.log(`      해결: ${f}`);
  console.log('\n  배포 패키지를 만들지 않았어요.\n');
  process.exit(1);
};
const sh = (cmd, args, opts = {}) => spawnSync(cmd, args, { cwd: ROOT, encoding: 'utf8', ...opts });
/** npm 은 Windows 에서 .cmd 라 셸로 실행한다 (인자는 고정 문자열만) */
const npm = (script, opts) => spawnSync(`npm run ${script}`, { cwd: ROOT, encoding: 'utf8', shell: true, ...opts });

console.log(`\n사緣 배포 패키지 만들기 · 대상 환경 ${target}`);

// ── 1. 준비 ──
step('준비 (Node.js · 기준정보 · 코드 상태)');
const [maj, min] = process.versions.node.split('.').map(Number);
if (maj < 22 || (maj === 22 && min < 12)) stop(`Node.js ${process.versions.node} — 22.12.0 이상이 필요해요`, 'Node.js 22.12.0 설치');
if (process.versions.node !== '22.12.0') warn(`Node.js ${process.versions.node} — 운영 서버와 같은 22.12.0 으로 만드는 것을 권장해요`);
else ok('Node.js 22.12.0');
if (process.platform !== 'win32') warn('Windows 가 아닌 곳에서 만들고 있어요 — 운영 서버(Windows)와 같은 OS 에서 만드는 것을 권장해요');
if (/[^\x20-\x7E]/.test(ROOT)) warn(`경로에 한글 등이 있어요: ${ROOT} — Node.js 22.12 에서는 영문 경로를 써야 해요`);
const T = loadTopology(target);
if (T.problems.length) {
  for (const p of T.problems) console.log(`  ✖ ${p}`);
  if (!FORCE) stop('servers.config.mjs 를 고쳐 주세요 (시험용으로 그냥 만들려면 --force)');
  warn('--force — 기준정보 오류가 있는 채로 만들어요 (운영 배포 금지)');
} else ok(`servers.config.mjs — Web ${T.publicUrl} · API ${T.apiUrl} · DB ${T.db.host}/${T.db.name} · 로그인 ${T.sso.mode ?? 'browser'}`);
const git = sh('git', ['status', '--porcelain']);
const commit = sh('git', ['rev-parse', '--short', 'HEAD']).stdout?.trim() ?? '';
if (git.status === 0 && git.stdout.trim()) warn(`커밋하지 않은 변경 ${git.stdout.trim().split('\n').length}개 — 배포한 코드를 다시 찾을 수 있게 커밋 후 만드는 것을 권장해요`);
else if (git.status === 0) ok(`git 커밋 ${commit}`);
for (const [dir, label] of [['server/node_modules', 'server'], ['client/node_modules', 'client']]) {
  if (!fs.existsSync(path.join(ROOT, dir))) stop(`${label} 패키지가 없어요`, `${label} 폴더에서  npm ci`);
}
ok('server · client 패키지 있음');

// ── 2. 화면 빌드 ──
step('화면 빌드 (npm run build)');
const build = npm('build', { cwd: path.join(ROOT, 'client'), env: { ...process.env, SASYSTEM_TARGET: target }, stdio: ['ignore', 'pipe', 'pipe'] });
if (build.status !== 0) {
  console.log((build.stdout + build.stderr).split('\n').slice(-25).join('\n'));
  stop('화면 빌드에 실패했어요 (위 내용)');
}
const dist = path.join(ROOT, 'client', 'dist');
const info = JSON.parse(fs.readFileSync(path.join(dist, '_deploy', 'build.json'), 'utf8'));
if (info.target !== target) stop(`빌드 대상(${info.target})이 ${target} 과 달라요`);
ok(`빌드 ${info.buildId} · 운영 모드 · 로그인 ${info.ssoMode}${info.ssoMode === 'browser' ? ` · 인사정보 URL ${info.employeeUrl || '(비어 있음)'}` : ''}`);
if (info.ssoMode === 'browser' && !info.employeeUrl) warn('사내 인사정보 URL(sso.employeeApi.url)이 비어 있어요 — 모든 사용자가 안내 화면으로 가요');
if (!info.licensed) warn('DevExtreme 라이선스 키가 빌드에 없어요 — 화면 위에 평가판 배너가 떠요 (client/src/.devextreme/license-key.js)');
else ok('DevExtreme 라이선스 포함');

// ── 3. 패키지 만들기 ──
step('패키지 만들기');
const out = path.join(ROOT, 'release', `${info.buildId}-${target}`);
fs.rmSync(out, { recursive: true, force: true });
const copy = (from, to, filter) => fs.cpSync(path.join(ROOT, from), path.join(out, to), { recursive: true, filter });
// web
copy('client/dist', 'web');
/** api.basePath 가 있으면 사緣 전용 사이트 대신 다른 앱 routes 폴더에 끼워 넣는 묶음 */
const PLUGIN_MODE = Boolean(T.api.basePath);
const appName = target === 'development' ? 'sasystem-api-dev' : 'sasystem-api';
if (PLUGIN_MODE) {
  try {
    await buildPlugin({ target, T, outRoutes: path.join(out, 'routes'), buildId: info.buildId });
  } catch (e) {
    stop(`끼워 넣기 묶음을 만들지 못했어요 — ${e.message}`);
  }
  ok(`release/${path.basename(out)}/web · routes/${pluginFolderOf(T)} (다른 iisnode 앱에 끼워 넣기 · 경로 ${T.api.basePath})`);
} else {
// api — 서버 폴더를 그대로 (비밀 파일·로그 제외). 이 폴더가 곧 IIS 사이트 폴더다
const SECRET = (src) => {
  const rel = path.relative(ROOT, src).split(path.sep).join('/');
  return !(rel === 'server/.env' || rel === 'server/config/admins.js' || rel.startsWith('server/iisnode') || rel === 'server/web.config');
};
for (const d of ['routes', 'src', 'shared', 'scripts', 'sql', 'config', 'node_modules']) copy(`server/${d}`, `api/${d}`, SECRET);
for (const f of ['main.js', 'package.json', 'package-lock.json', 'preflight.cjs', '.env.example']) copy(`server/${f}`, `api/${f}`);
copy('servers.config.mjs', 'api/servers.config.mjs'); // Web 서버 주소 · 관리자 주소 · 사내 로그인 방식
fs.writeFileSync(path.join(out, 'api', 'web.config'), buildApiWebConfig(T)); // 이 환경의 포트 · DB 서버
// API 배포 스크립트 (기준정보 값을 넣어 만든다)
fs.mkdirSync(path.join(out, 'api', '_deploy'), { recursive: true });
let ps = fs.readFileSync(path.join(ROOT, 'tools', 'templates', 'deploy-api.ps1'), 'utf8').replace(/^\uFEFF/, '');
for (const [k, v] of Object.entries({ __APP_NAME__: appName, __API_PORT__: String(T.api.port), __ENV__: target, __BUILD_ID__: info.buildId, __WEB_HOST__: T.web.host, __API_HTTPS__: String(T.api.https), __API_DNS__: T.api.dnsName, __API_URL__: T.apiUrl })) ps = ps.split(k).join(v);
fs.writeFileSync(path.join(out, 'api', '_deploy', 'deploy-api.ps1'), `\uFEFF${ps.replace(/\r?\n/g, '\r\n')}`);
fs.writeFileSync(path.join(out, 'api', '_deploy', 'build.json'), JSON.stringify({ ...info, appName }, null, 2));
ok(`release/${path.basename(out)}/web · api`);
}

// ── 4. 패키지 점검 ──
step('패키지 점검');
const leaked = [];
const walk = (dir) => {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    if (fs.statSync(full).isDirectory()) {
      if (name !== 'node_modules') walk(full);
    } else if (name === '.env' || (name === 'admins.js' && full.includes(`${path.sep}config${path.sep}`)) || name === 'license-key.js') leaked.push(path.relative(out, full));
  }
};
walk(out);
if (leaked.length) stop(`비밀 파일이 패키지에 들어갔어요: ${leaked.join(', ')}`);
ok('.env · admins.js · 라이선스 키 없음');
const pluginDir = `routes/${pluginFolderOf(T)}`;
const apiFiles = PLUGIN_MODE
  ? [`${pluginDir}/index.js`, `${pluginDir}/package.json`, `${pluginDir}/web.config`, `${pluginDir}/.env.example`, `${pluginDir}/tools/db-setup.mjs`]
  : ['api/main.js', 'api/web.config', 'api/routes/index.js', 'api/shared/api/core/service.js', 'api/servers.config.mjs', 'api/node_modules/mssql/package.json', 'api/node_modules/lunar-javascript/package.json'];
for (const f of ['web/index.html', 'web/web.config', 'web/sasystem.config.js', 'web/_deploy/check-web.ps1', ...apiFiles]) {
  if (!fs.existsSync(path.join(out, f))) stop(`패키지에 ${f} 가 없어요`);
}
ok(PLUGIN_MODE ? '필수 파일 있음 (화면 · Web IIS 설정 · 점검 스크립트 · 사緣 묶음 · 폴더 보호 web.config · DB 준비 도구)' : '필수 파일 있음 (화면 · Web IIS 설정 · 점검 스크립트 · API main.js · web.config · routes · 업무 규칙 · DB 드라이버 · 사주 라이브러리)');
if (PLUGIN_MODE) {
  // 그 앱처럼 require() 해서 시작까지 (DB 없이 STORE=memory)
  const load = smokeTestPlugin(path.join(out, pluginDir));
  if (load.status !== 0 || !load.stdout.includes('loaded')) stop('묶음을 불러오지 못했어요', (load.stderr || load.stdout).trim().split('\n').slice(-3));
  ok(`묶음 불러오기 성공 — require('./${pluginDir}') 가 미들웨어 함수 (환경 ${target} · DB ${T.db.name})`);
} else {
// 패키지 안에서 서버 코드를 실제로 불러 본다 (라이브러리가 빠졌으면 여기서 걸린다)
const load = sh(process.execPath, ['--input-type=module', '-e', [
  `const u=(p)=>${JSON.stringify(pathToFileURL(path.join(out, 'api')).href)}+'/'+p;`,
  "const c=await import(u('src/config.js')); if(c.config.envName!==" + JSON.stringify(target) + ") throw new Error('web.config 환경이 '+c.config.envName);",
  "await import(u('src/sso.js')); await import(u('src/store.js')); await import(u('src/app.js')); await import(u('routes/index.js'));",
  "console.log('loaded');",
].join('')], { shell: false });
if (load.status !== 0 || !load.stdout.includes('loaded')) stop('패키지의 서버 코드를 불러오지 못했어요', (load.stderr || load.stdout).trim().split('\n').slice(-3));
ok(`패키지 안에서 서버 코드 불러오기 성공 (web.config 환경 ${target} · 포트 ${T.api.port} · DB ${T.db.name})`);
}

// ── 5. 안내 ──
const guide = `사緣 배포 패키지 ${info.buildId} (${target})
만든 때 ${new Date().toLocaleString('ko-KR')} · 커밋 ${commit || '-'}
Web  ${T.publicUrl}   (IIS 사이트 — 화면 파일만. 서버끼리 통신 없음)
API  ${T.apiUrl}   (사용자 PC 브라우저가 직접 부름 · ${PLUGIN_MODE ? `다른 iisnode 앱에 끼워 넣기 — routes\\${pluginFolderOf(T)} 폴더째 복사` : `IIS + iisnode 사이트 ${appName} — api 폴더째 복사`})
DB   ${T.db.host}:${T.db.port} / ${T.db.name}   (API 서버만 접속)
방화벽  사용자 PC 대역 → Web ${T.web.port} · 사용자 PC 대역 → API ${T.api.port} · API → DB ${T.db.port}  (Web ↔ API 통신 없음)

배포 순서 (자세한 내용: docs/GO-LIVE.md)
 1) 이 폴더를 통째로 운영 서버에 복사 (USB·공유폴더). 영문 경로에 둔다 — 예) C:\\deploy\\${path.basename(out)}
${
  PLUGIN_MODE
    ? ` 2) API 서버 ${T.api.host} — routes\\${pluginFolderOf(T)} 폴더를 그 앱의 routes 폴더에 복사 (.env · config\\admins.js 는 덮어쓰지 말 것)
    처음이면 그 앱 main.js 에  app.use('${T.api.basePath}', require('./routes/${pluginFolderOf(T)}'));  한 줄 → routes\\${pluginFolderOf(T)}\\설치안내.txt
    → 그 앱의 IIS 앱 풀 재시작 → ${T.apiUrl}/api/health${T.api.https ? `\n    (https — 그 앱 사이트에 '${T.api.dnsName}' 인증서 바인딩, 사용자 PC 가 이 이름을 찾고 인증서를 믿어야 한다)` : ''}`
    : ` 2) API 서버 ${T.api.host}  — PowerShell
      powershell -ExecutionPolicy Bypass -File api\\_deploy\\deploy-api.ps1
    → 확인·백업·교체(.env · admins.js 는 그대로)·npm run check·앱 풀 재시작·상태 확인까지 한다. 점검 실패면 이전 버전으로 자동으로 되돌린다
    (직접 복사해도 된다: api 폴더 → IIS 사이트 폴더, .env · config\\admins.js 는 덮어쓰지 말 것)`
}
 3) Web 서버 ${T.web.host} — PowerShell(관리자)
      powershell -ExecutionPolicy Bypass -File web\\_deploy\\deploy-web.ps1 -SitePath <IIS 사이트 폴더>
    → 백업·교체·check-web.ps1(IIS 구성·파일·화면 응답)까지 한다
 4) 사내 PC 브라우저에서 ${T.apiUrl}/api/health → {"ok":true …} (안 열리면 방화벽 · DNS · 인증서)
    → ${T.publicUrl} → 로그인 화면 없이 홈이 열리는지, 새로 넣은 기능 확인
되돌리기: 각 스크립트가 마지막에 보여주는 -Rollback 명령
`;
fs.writeFileSync(path.join(out, '배포안내.txt'), `\uFEFF${guide.replace(/\n/g, '\r\n')}`);

if (ZIP && process.platform === 'win32') {
  const z = sh('powershell', ['-NoProfile', '-Command', `Compress-Archive -Path '${out}\\*' -DestinationPath '${out}.zip' -Force`]);
  if (z.status === 0) ok(`${path.basename(out)}.zip`);
  else warn('zip 을 만들지 못했어요 — 폴더를 그대로 복사해 주세요');
}

console.log(`\n────────────────────────────────────────\n  배포 패키지 준비 완료: release/${path.basename(out)}\n`);
console.log(guide.split('\n').slice(5).map((l) => `  ${l}`).join('\n'));
