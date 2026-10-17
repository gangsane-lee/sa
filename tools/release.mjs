/**
 * 배포 패키지 만들기 — 개발 서버(인터넷 되는 곳)에서 실행:  server 폴더에서  npm run release
 *   npm run release -- --env development     개발 환경용
 *   npm run release -- --zip                 폴더와 함께 .zip 도 만든다
 *
 * 만드는 것: release/<빌드번호>-<환경>/
 *   web/   Web 서버(IIS) 사이트 폴더에 그대로 복사할 화면 파일 + web.config + _deploy/(점검·배포 스크립트)
 *   api/   API 서버 설치 폴더로 옮길 서버 코드 + 라이브러리(오프라인 설치용) + _deploy/deploy-api.ps1
 *   배포안내.txt   이 빌드의 순서·점검 명령
 * 각 단계마다 확인하고, 문제가 있으면 원인·해결을 보여주고 멈춘다. (.env · admins.js · 라이선스 키는 넣지 않는다)
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadTopology } from './topology.mjs';

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
} else ok(`servers.config.mjs — Web ${T.publicUrl} · API ${T.apiUrl} · DB ${T.db.host}/${T.db.name} · ${T.serviceMode}`);
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
const mock = T.serviceMode === 'test' ? 'true' : 'false';
const build = npm('build', { cwd: path.join(ROOT, 'client'), env: { ...process.env, SAYEON_TARGET: target, VITE_INCLUDE_MOCK: mock }, stdio: ['ignore', 'pipe', 'pipe'] });
if (build.status !== 0) {
  console.log((build.stdout + build.stderr).split('\n').slice(-25).join('\n'));
  stop('화면 빌드에 실패했어요 (위 내용)');
}
const dist = path.join(ROOT, 'client', 'dist');
const info = JSON.parse(fs.readFileSync(path.join(dist, '_deploy', 'build.json'), 'utf8'));
if (info.target !== target) stop(`빌드 대상(${info.target})이 ${target} 과 달라요`);
ok(`빌드 ${info.buildId} · 화면 모드 ${info.serviceMode} · 시연용 코드 ${info.mockIncluded ? '포함' : '없음'}`);
if (info.serviceMode === 'open' && info.mockIncluded) stop('정식 운영인데 시연용 코드가 들어갔어요');
if (!info.licensed) warn('DevExtreme 라이선스 키가 빌드에 없어요 — 화면 위에 평가판 배너가 떠요 (client/src/.devextreme/license-key.js)');
else ok('DevExtreme 라이선스 포함');

// ── 3. 패키지 만들기 ──
step('패키지 만들기');
const out = path.join(ROOT, 'release', `${info.buildId}-${target}`);
fs.rmSync(out, { recursive: true, force: true });
const copy = (from, to, filter) => fs.cpSync(path.join(ROOT, from), path.join(out, to), { recursive: true, filter });
// web
copy('client/dist', 'web');
// api — 서버가 실제로 쓰는 것만 (client 는 업무 규칙 코드와 사주 계산 라이브러리)
const SECRET = (src) => {
  const rel = path.relative(ROOT, src).split(path.sep).join('/');
  return !(rel === 'server/.env' || rel === 'server/config/admins.js' || rel.startsWith('server/logs') || rel.includes('/.devextreme'));
};
copy('servers.config.mjs', 'api/servers.config.mjs');
copy('tools/topology.mjs', 'api/tools/topology.mjs');
for (const d of ['src', 'scripts', 'sql', 'config', 'node_modules']) copy(`server/${d}`, `api/server/${d}`, SECRET);
for (const f of ['package.json', 'package-lock.json', 'preflight.cjs', 'start.cjs', 'ecosystem.config.cjs', '.env.example']) copy(`server/${f}`, `api/server/${f}`);
for (const d of ['api', 'constants', 'utils']) copy(`client/src/${d}`, `api/client/src/${d}`, SECRET);
copy('client/package.json', 'api/client/package.json');
copy('client/node_modules/lunar-javascript', 'api/client/node_modules/lunar-javascript');
// API 배포 스크립트 (기준정보 값을 넣어 만든다)
const appName = target === 'development' ? 'sayeon-api-dev' : 'sayeon-api';
fs.mkdirSync(path.join(out, 'api', '_deploy'), { recursive: true });
let ps = fs.readFileSync(path.join(ROOT, 'tools', 'templates', 'deploy-api.ps1'), 'utf8').replace(/^\uFEFF/, '');
for (const [k, v] of Object.entries({ __APP_NAME__: appName, __API_PORT__: String(T.api.port), __ENV__: target, __BUILD_ID__: info.buildId })) ps = ps.split(k).join(v);
fs.writeFileSync(path.join(out, 'api', '_deploy', 'deploy-api.ps1'), `\uFEFF${ps.replace(/\r?\n/g, '\r\n')}`);
fs.writeFileSync(path.join(out, 'api', '_deploy', 'build.json'), JSON.stringify({ ...info, appName }, null, 2));
ok(`release/${path.basename(out)}/web · api`);

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
for (const f of ['web/index.html', 'web/web.config', 'web/sayeon.config.js', 'web/_deploy/check-web.ps1', 'api/server/start.cjs', 'api/server/node_modules/pm2/package.json', 'api/server/node_modules/mssql/package.json', 'api/client/node_modules/lunar-javascript/package.json']) {
  if (!fs.existsSync(path.join(out, f))) stop(`패키지에 ${f} 가 없어요`);
}
ok('필수 파일 있음 (화면 · IIS 설정 · 점검 스크립트 · 서버 · PM2 · DB 드라이버 · 사주 라이브러리)');
// 패키지 안에서 서버 코드를 실제로 불러 본다 (라이브러리가 빠졌으면 여기서 걸린다)
const load = sh(process.execPath, ['--input-type=module', '-e', [
  `process.env.SAYEON_ENV=${JSON.stringify(target)};`,
  `const u=(p)=>${JSON.stringify(pathToFileURL(path.join(out, 'api')).href)}+'/'+p;`,
  "await import(u('server/src/config.js')); await import(u('server/src/sso.js')); await import(u('server/src/store.js')); await import(u('server/src/app.js'));",
  "console.log('loaded');",
].join('')], { shell: false });
if (load.status !== 0 || !load.stdout.includes('loaded')) stop('패키지의 서버 코드를 불러오지 못했어요', (load.stderr || load.stdout).trim().split('\n').slice(-3));
ok('패키지 안에서 서버 코드 불러오기 성공');

// ── 5. 안내 ──
const guide = `사緣 배포 패키지 ${info.buildId} (${target})
만든 때 ${new Date().toLocaleString('ko-KR')} · 커밋 ${commit || '-'}
Web  ${T.publicUrl}   (IIS 사이트, Windows 인증)
API  ${T.apiUrl}   (PM2 ${appName})
DB   ${T.db.host}:${T.db.port} / ${T.db.name}

배포 순서 (자세한 내용: docs/GO-LIVE.md)
 1) 이 폴더를 통째로 운영 서버에 복사 (USB·공유폴더). 영문 경로에 둔다 — 예) C:\\deploy\\${path.basename(out)}
 2) API 서버 ${T.api.host}  — PowerShell
      powershell -ExecutionPolicy Bypass -File api\\_deploy\\deploy-api.ps1
    → 확인·백업·교체·npm run check·시작·상태 확인까지 한다. 점검 실패면 이전 버전으로 자동으로 되돌린다
 3) Web 서버 ${T.web.host} — PowerShell(관리자)
      powershell -ExecutionPolicy Bypass -File web\\_deploy\\deploy-web.ps1 -SitePath <IIS 사이트 폴더>
    → 백업·교체·check-web.ps1(IIS 구성·파일·API 연결·로그인 시험)까지 한다
 4) 사내 PC 에서 ${T.publicUrl} → 로그인 화면 없이 홈이 열리는지, 새로 넣은 기능 확인
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
