/**
 * 끼워 넣기 묶음 만들기 — 사緣 API 를 회사의 다른 iisnode(Express) 앱 routes 폴더에 파일만 복사해 넣을 수 있게 만든다.
 * API 서버가 오프라인이라 npm install · 사이트 만들기가 어려울 때 쓴다. (사緣 전용 IIS 사이트로 배포하면 npm run release)
 *
 *   server 폴더에서  npm run plugin                      운영 (servers.config.mjs 의 production.api.basePath)
 *                    npm run plugin -- --env development  개발
 *
 * 만드는 것: release/routes-<환경>/routes/<basePath>/   예) routes/sayeon/
 *   index.js          서버 코드 + 라이브러리(express · mssql · 사주 …)를 하나로 묶은 파일 (CommonJS)
 *                     그 앱 main.js 에  app.use('/sayeon', require('./routes/sayeon'));  한 줄
 *   package.json      이 폴더는 CommonJS (그 앱이 ESM 이어도 그대로 불러진다)
 *   web.config        이 폴더 파일을 브라우저가 내려받지 못하게 막는다 (.env · 관리자 파일 보호)
 *   .env.example      비밀번호·키 — 서버에서 .env 로 복사해 채운다
 *   config/           관리자 계정 (admins.example.js → admins.js)
 *   tools/            db-setup.mjs · sso-test.mjs · hash-password.mjs (node 로 바로 실행, npm 필요 없음)
 *   sql/setup.sql     DB 담당자용
 *   설치안내.txt
 * 기준정보(servers.config.mjs)와 환경은 index.js 안에 들어간다 — 바꾸면 다시 묶는다.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadTopology } from './topology.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SERVER = path.join(ROOT, 'server');

/** 묶음 폴더 이름 = basePath ('/sayeon' → 'sayeon') */
export const pluginFolderOf = (T) => T.api.basePath.replace(/^\//, '');

/**
 * @param {{ target: string, T: object, outRoutes: string, buildId?: string }} o  outRoutes = 묶음을 넣을 routes 폴더
 * @returns {Promise<string>} 만든 묶음 폴더
 */
export async function buildPlugin({ target, T, outRoutes, buildId = '' }) {
  const folder = pluginFolderOf(T);
  if (!folder) throw new Error(`servers.config.mjs 의 ${target}.api.basePath 가 비어 있어요 — 그 앱에 붙일 경로(예: '/sayeon')를 정해 주세요`);
  const out = path.join(outRoutes, folder);
  fs.rmSync(out, { recursive: true, force: true });
  fs.mkdirSync(path.join(out, 'tools'), { recursive: true });

  const rolldownEntry = path.join(ROOT, 'client', 'node_modules', 'rolldown', 'dist', 'index.mjs');
  if (!fs.existsSync(rolldownEntry)) throw new Error('묶는 도구(rolldown)가 없어요 — client 폴더에서 npm ci');
  const { build } = await import(pathToFileURL(rolldownEntry).href);

  // 서버 폴더용 설정 읽기(runtime.js) 대신 묶음용(runtime.plugin.js)
  const runtimeSwap = {
    name: 'sayeon-runtime',
    resolveId(source, importer) {
      if (importer && /[\\/]server[\\/]src[\\/]/.test(importer) && /^\.\/runtime\.js$/.test(source)) return path.join(SERVER, 'src', 'runtime.plugin.js');
      return null;
    },
  };
  const common = {
    platform: 'node',
    plugins: [runtimeSwap],
    transform: { define: { __SAYEON_ENV__: JSON.stringify(target) } },
    logLevel: 'warn',
  };

  // 1) 서버 — 그 앱이 require() 하는 파일
  await build({
    ...common,
    input: path.join(SERVER, 'src', 'plugin.js'),
    output: {
      file: path.join(out, 'index.js'),
      format: 'cjs',
      exports: 'default',
      codeSplitting: false,
      banner: `/* 사緣 API 묶음 ${buildId} (${target}) — 직접 고치지 말고 다시 묶는다 (tools/plugin.mjs) */\nvar __SAYEON_ROOT__ = __dirname;`,
    },
  });

  // 2) 관리 도구 — 이 폴더 tools/ 에서 node 로 바로 실행 (묶음 폴더 = tools 의 한 단계 위)
  const toolBanner = [
    "import { fileURLToPath as __syUrl } from 'node:url';",
    "import { dirname as __syDir } from 'node:path';",
    'const __SAYEON_ROOT__ = __syDir(__syDir(__syUrl(import.meta.url)));',
  ].join('\n');
  for (const name of ['db-setup', 'sso-test', 'hash-password']) {
    await build({
      ...common,
      input: path.join(SERVER, 'scripts', `${name}.js`),
      output: { file: path.join(out, 'tools', `${name}.mjs`), format: 'esm', codeSplitting: false, banner: toolBanner },
    });
  }

  // 3) 함께 두는 파일
  const write = (rel, text) => {
    fs.mkdirSync(path.dirname(path.join(out, rel)), { recursive: true });
    fs.writeFileSync(path.join(out, rel), text);
  };
  write('package.json', `${JSON.stringify({ name: `sayeon-routes-${folder}`, private: true, type: 'commonjs', main: 'index.js' }, null, 2)}\n`);
  write('config/package.json', `${JSON.stringify({ type: 'module' }, null, 2)}\n`); // admins.js 는 export default 문법
  fs.copyFileSync(path.join(SERVER, 'config', 'admins.example.js'), path.join(out, 'config', 'admins.example.js'));
  fs.mkdirSync(path.join(out, 'sql'), { recursive: true });
  fs.copyFileSync(path.join(SERVER, 'sql', 'setup.sql'), path.join(out, 'sql', 'setup.sql'));
  const tpl = (name) => fs.readFileSync(path.join(ROOT, 'tools', 'templates', name), 'utf8').replace(/^﻿/, '');
  const fill = (s) =>
    Object.entries({
      __FOLDER__: folder,
      __BASE_PATH__: T.api.basePath,
      __ENV__: target,
      __BUILD_ID__: buildId || '-',
      __API_URL__: T.apiUrl,
      __API_PORT__: String(T.api.port),
      __WEB_URL__: T.publicUrl,
      __WEB_HOST__: T.web.host,
      __DB__: `${T.db.host}:${T.db.port} / ${T.db.name}`,
      __HTTPS_STEP__: T.api.https
        ? [
            '',
            ` 3-1) https — 그 앱의 IIS 사이트에 https 바인딩(포트 ${T.api.port})과 '${T.api.dnsName}' 인증서가 있어야 한다`,
            `      Get-WebBinding -Name <그 앱의 사이트 이름>   → https *:${T.api.port}: 이 보이는지`,
            `      인증서: 로컬 컴퓨터\\개인 저장소에 '${T.api.dnsName}' (Get-ChildItem Cert:\\LocalMachine\\My | Select Subject, NotAfter)`,
            `    · Web 서버(${T.web.host})가 '${T.api.dnsName}' 이름을 찾을 수 있어야 한다 — 사내 DNS 등록 (없으면 Web 서버 hosts 파일에 '${T.api.host} ${T.api.dnsName}')`,
            '    · 인증서를 발급한 사내 인증 기관(루트) 인증서가 Web 서버의 "신뢰할 수 있는 루트 인증 기관"에 있어야 한다 (없으면 /api 가 502)',
            `    · API 서버 방화벽: Web 서버 ${T.web.host} → ${T.api.port} 허용`,
          ].join('\n')
        : '',
    }).reduce((acc, [k, v]) => acc.split(k).join(v), s);
  write('web.config', tpl('plugin-web.config'));
  write('.env.example', fill(tpl('plugin.env.example')));
  write('설치안내.txt', `﻿${fill(tpl('plugin-guide.txt')).replace(/\r?\n/g, '\r\n')}`);
  fs.writeFileSync(path.join(out, 'build.json'), JSON.stringify({ buildId, target, basePath: T.api.basePath, apiUrl: T.apiUrl, web: T.publicUrl, db: T.db.name, builtAt: new Date().toISOString() }, null, 2));
  return out;
}

/** 묶음을 실제로 불러 본다 — 그 앱처럼 require() 하고 미들웨어 함수인지 확인 (DB 연결은 하지 않는다: STORE=memory) */
export function smokeTestPlugin(dir) {
  const code = [
    `const m = require(${JSON.stringify(dir)});`,
    "if (typeof m !== 'function') throw new Error('묶음이 미들웨어 함수가 아니에요: ' + typeof m);",
    "m.whenReady().then(() => { console.log('loaded'); process.exit(0); }, (e) => { console.error(e.message); process.exit(1); });",
  ].join('');
  // STORE=memory 로 띄워 DB 없이 시작까지 본다 — 묶음 폴더에 .env 가 없으므로 임시로 만든다
  const env = path.join(dir, '.env');
  fs.writeFileSync(env, 'STORE=memory\n');
  try {
    return spawnSync(process.execPath, ['-e', code], { encoding: 'utf8', timeout: 30_000 });
  } finally {
    fs.rmSync(env, { force: true });
  }
}

// ── 직접 실행: npm run plugin [-- --env development] ──
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2);
  const target = argv.includes('--env') ? argv[argv.indexOf('--env') + 1] : 'production';
  const T = loadTopology(target);
  console.log(`\n사緣 끼워 넣기 묶음 만들기 · 대상 환경 ${target}`);
  if (T.problems.length) {
    for (const p of T.problems) console.log(`  ✖ ${p}`);
    if (!argv.includes('--force')) {
      console.log('\n  servers.config.mjs 를 고친 뒤 다시 실행해 주세요. (시험용으로 그냥 만들려면 --force — 서버에서는 시작하지 않아요)\n');
      process.exit(1);
    }
    console.log('  ⚠ --force — 기준정보 오류가 있는 채로 만들어요 (운영 배포 금지)');
  }
  const stamp = new Date().toISOString().replace(/\D/g, '').slice(2, 12);
  const outRoutes = path.join(ROOT, 'release', `routes-${target}`, 'routes');
  try {
    const dir = await buildPlugin({ target, T, outRoutes, buildId: stamp });
    const load = smokeTestPlugin(dir);
    if (load.status !== 0 || !load.stdout.includes('loaded')) {
      console.log((load.stderr || load.stdout).trim().split('\n').slice(-5).join('\n'));
      throw new Error('만든 묶음을 불러오지 못했어요 (위 내용)');
    }
    const size = (f) => `${(fs.statSync(path.join(dir, f)).size / 1048576).toFixed(1)}MB`;
    console.log(`  ✔ ${path.relative(ROOT, dir)}  (index.js ${size('index.js')})`);
    console.log(`  ✔ 불러오기 확인 — require('./routes/${pluginFolderOf(T)}') 가 미들웨어 함수`);
    console.log(`\n  그 앱 main.js:  app.use('${T.api.basePath}', require('./routes/${pluginFolderOf(T)}'));`);
    console.log(`  Web 서버 /api → ${T.apiUrl}/api   (화면 빌드 npm run build 가 이 주소로 web.config 를 만든다)`);
    console.log(`  자세한 순서: ${path.relative(ROOT, path.join(dir, '설치안내.txt'))}\n`);
  } catch (e) {
    console.log(`  ✖ ${e.message}\n`);
    process.exit(1);
  }
}
