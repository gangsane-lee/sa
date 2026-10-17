/**
 * 빌드 뒤처리 — npm run build 가 자동으로 실행한다(postbuild).
 * servers.config.mjs(마스터)의 값으로 Web 서버(IIS)에 둘 파일을 dist 에 만든다.
 *
 *   dist/web.config              IIS 설정: /api → API 서버로 전달(로그인 계정 헤더 포함) · 화면 주소 처리 · 캐시
 *   dist/sayeon.config.js        화면 운영 설정 (정식/시연 · 관리자 주소)
 *   dist/_deploy/                Web 서버 점검·배포 스크립트와 파일 목록 (웹으로는 열리지 않는다)
 *       check-web.ps1 · deploy-web.ps1 · manifest.json · build.json
 *
 * 대상 환경: SAYEON_TARGET (기본 production) — 예) set SAYEON_TARGET=development && npm run build
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { loadTopology } from '../../tools/topology.mjs';

const CLIENT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(CLIENT, 'dist');
const target = process.env.SAYEON_TARGET || 'production';
const T = loadTopology(target);
const fail = (m) => {
  console.error(`\n  ✖ ${m}\n`);
  process.exit(1);
};

console.log(`\n[postbuild] 대상 환경 ${target} · Web ${T.publicUrl} → API ${T.apiUrl}`);
if (T.problems.length) {
  console.warn('  ⚠ servers.config.mjs 확인이 필요해요 (배포 전에 고쳐야 해요):');
  for (const p of T.problems) console.warn(`    - ${p}`);
}
if (!fs.existsSync(path.join(DIST, 'index.html'))) fail('dist/index.html 이 없어요 — 빌드가 끝나지 않았어요');

// 빌드 종류와 운영 방식이 맞는지
const bundle = fs.readdirSync(path.join(DIST, 'assets')).filter((f) => f.endsWith('.js')).map((f) => fs.readFileSync(path.join(DIST, 'assets', f), 'utf8')).join('\n');
const mockIncluded = bundle.includes('sayeon.mock.db');
if (T.serviceMode === 'test' && !mockIncluded) fail('servers.config.mjs 는 시연(test)인데 가짜 데이터가 빠진 빌드예요 — client/.env.production 의 VITE_INCLUDE_MOCK=true 로 다시 빌드');
if (T.serviceMode === 'open' && mockIncluded) console.warn('  ⚠ 정식(open)인데 시연용 코드가 들어 있어요 — 운영 배포라면 client/.env.production 의 VITE_INCLUDE_MOCK=false 로 다시 빌드');
const licKey = (() => {
  try {
    return /licenseKey = '([^']+)'/.exec(fs.readFileSync(path.join(CLIENT, 'src', '.devextreme', 'license-key.js'), 'utf8'))?.[1] ?? null;
  } catch {
    return null;
  }
})();
const licensed = Boolean(licKey && licKey !== 'TRIAL' && bundle.includes(licKey.slice(0, 40)));
if (!licensed) console.warn('  ⚠ DevExtreme 라이선스 키가 빌드에 없어요 — 화면 위에 평가판 배너가 떠요 (docs/GO-LIVE.md)');

// 1) 화면 운영 설정 (빌드에 들어 있던 개발용 sayeon.config.js 를 덮어쓴다)
fs.writeFileSync(path.join(DIST, 'sayeon.config.js'), `window.SAYEON_CONFIG = ${JSON.stringify({ mode: T.serviceMode, adminPath: T.adminPath })};\n`);

// 2) IIS 설정
const serverVar = `HTTP_${T.sso.header.toUpperCase().replace(/-/g, '_')}`;
const xml = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
const webConfig = `<?xml version="1.0" encoding="UTF-8"?>
<!--
  사緣 Web 서버(IIS) 설정 — npm run build 가 servers.config.mjs(${target})로 만든 파일. 직접 고치지 말고 마스터를 고쳐 다시 빌드.
  필요: IIS · Windows 인증 · URL Rewrite · ARR(프록시 켜짐) · 허용 서버 변수 ${serverVar}  → _deploy/check-web.ps1 이 확인
  Windows 인증 켜기·익명 끄기는 IIS 관리자(사이트 → 인증)에서 한다 (이 파일로는 바꿀 수 없게 잠겨 있다)
-->
<configuration>
  <system.webServer>
    <rewrite>
      <rules>
        <!-- /api → API 서버. Windows 인증으로 확인한 계정(DOMAIN\\아이디)을 헤더로 넘긴다 (사용자가 보낸 같은 헤더는 덮어쓴다) -->
        <rule name="sayeon-api" stopProcessing="true">
          <match url="^api/(.*)" />
          <serverVariables>
            <set name="${serverVar}" value="{LOGON_USER}" />
          </serverVariables>
          <action type="Rewrite" url="${xml(T.apiUrl)}/api/{R:1}" />
        </rule>
        <!-- 화면 주소(/saju, /messages …)를 새로 고쳐도 index.html 로 -->
        <rule name="sayeon-spa" stopProcessing="true">
          <match url=".*" />
          <conditions logicalGrouping="MatchAll">
            <add input="{REQUEST_FILENAME}" matchType="IsFile" negate="true" />
            <add input="{REQUEST_FILENAME}" matchType="IsDirectory" negate="true" />
          </conditions>
          <action type="Rewrite" url="/index.html" />
        </rule>
      </rules>
    </rewrite>
    <security>
      <requestFiltering>
        <hiddenSegments>
          <add segment="_deploy" />
        </hiddenSegments>
      </requestFiltering>
    </security>
    <staticContent>
      <remove fileExtension=".woff2" />
      <mimeMap fileExtension=".woff2" mimeType="font/woff2" />
      <remove fileExtension=".woff" />
      <mimeMap fileExtension=".woff" mimeType="font/woff" />
      <clientCache cacheControlMode="UseMaxAge" cacheControlMaxAge="7.00:00:00" />
    </staticContent>
    <httpProtocol>
      <customHeaders>
        <add name="X-Content-Type-Options" value="nosniff" />
        <add name="X-Frame-Options" value="DENY" />
        <add name="Referrer-Policy" value="no-referrer" />
      </customHeaders>
    </httpProtocol>
  </system.webServer>
  <!-- 바뀌면 바로 반영돼야 하는 파일은 캐시하지 않는다 -->
  <location path="index.html">
    <system.webServer><staticContent><clientCache cacheControlMode="DisableCache" /></staticContent></system.webServer>
  </location>
  <location path="sayeon.config.js">
    <system.webServer><staticContent><clientCache cacheControlMode="DisableCache" /></staticContent></system.webServer>
  </location>
</configuration>
`;
fs.writeFileSync(path.join(DIST, 'web.config'), webConfig);

// 3) 배포 정보 · 파일 목록 · 점검 스크립트
const deployDir = path.join(DIST, '_deploy');
fs.rmSync(deployDir, { recursive: true, force: true });
fs.mkdirSync(deployDir);
let commit = '';
try {
  commit = execSync('git rev-parse --short HEAD', { cwd: CLIENT, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  if (execSync('git status --porcelain', { cwd: CLIENT, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()) commit += '-dirty'; // 커밋하지 않은 변경이 있는 빌드
} catch {
  /* git 없음 */
}
const d = new Date();
const pad = (n) => String(n).padStart(2, '0');
const buildId = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${commit ? `-${commit}` : ''}`;
const build = { buildId, target, builtAt: d.toISOString(), commit, serviceMode: T.serviceMode, mockIncluded, licensed, web: T.publicUrl, api: T.apiUrl };
fs.writeFileSync(path.join(deployDir, 'build.json'), JSON.stringify(build, null, 2));

const files = {};
const walk = (dir) => {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const rel = path.relative(DIST, full).split(path.sep).join('/');
    if (rel.startsWith('_deploy')) continue;
    if (fs.statSync(full).isDirectory()) walk(full);
    else files[rel] = crypto.createHash('sha256').update(fs.readFileSync(full)).digest('hex');
  }
};
walk(DIST);
fs.writeFileSync(path.join(deployDir, 'manifest.json'), JSON.stringify({ buildId, files }, null, 2));

// PowerShell 5.1 이 한글을 읽으려면 UTF-8 BOM 이 필요하다
const BOM = '﻿';
const values = {
  __API_URL__: T.apiUrl, __API_HOST__: T.api.host, __API_PORT__: String(T.api.port), __WEB_PORT__: String(T.web.port),
  __SERVER_VAR__: serverVar, __DOMAIN__: T.sso.domain ?? '', __ENV__: target, __SERVICE_MODE__: T.serviceMode,
  __BUILD_ID__: buildId, __PUBLIC_URL__: T.publicUrl,
};
for (const name of ['check-web.ps1', 'deploy-web.ps1']) {
  let s = fs.readFileSync(path.join(CLIENT, 'scripts', 'templates', name), 'utf8').replace(/^﻿/, '');
  for (const [k, v] of Object.entries(values)) s = s.split(k).join(v.replace(/'/g, "''"));
  fs.writeFileSync(path.join(deployDir, name), BOM + s.replace(/\r?\n/g, '\r\n'));
}

console.log(`  ✔ web.config · sayeon.config.js(${T.serviceMode}) · _deploy/ (점검 스크립트 · 파일 ${Object.keys(files).length}개 목록)`);
console.log(`  ✔ 빌드 ${buildId}${licensed ? '' : ' · ⚠ 라이선스 없음'}${mockIncluded ? ' · 시연용 코드 포함' : ''}\n`);
