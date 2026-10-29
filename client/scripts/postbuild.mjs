/**
 * 빌드 뒤처리 — npm run build 가 자동으로 실행한다(postbuild).
 * servers.config.mjs(마스터)의 값으로 Web 서버(IIS)에 둘 파일을 dist 에 만든다.
 *
 *   dist/web.config              IIS 설정: 화면 주소 처리 · 캐시 (Web 서버는 화면 파일만 낸다 — /api 를 넘기지 않는다)
 *   dist/sayeon.config.js        화면 설정 (API 서버 주소 · 관리자 주소 · 사내 인사정보 URL) — 빌드는 늘 운영 모드
 *                                사용자 브라우저가 이 API 주소를 직접 부른다
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

console.log(`\n[postbuild] 대상 환경 ${target} · 화면 ${T.publicUrl} · 브라우저가 부를 API ${T.apiUrl}`);
if (T.problems.length) {
  console.warn('  ⚠ servers.config.mjs 확인이 필요해요 (배포 전에 고쳐야 해요):');
  for (const p of T.problems) console.warn(`    - ${p}`);
}
if (!fs.existsSync(path.join(DIST, 'index.html'))) fail('dist/index.html 이 없어요 — 빌드가 끝나지 않았어요');

// 운영 빌드에는 개발 모드의 가짜 데이터·테스트 계정이 없어야 한다
const bundle = fs.readdirSync(path.join(DIST, 'assets')).filter((f) => f.endsWith('.js')).map((f) => fs.readFileSync(path.join(DIST, 'assets', f), 'utf8')).join('\n');
const mockIncluded = bundle.includes('sayeon.mock.db') || bundle.includes('sayeon1234');
if (mockIncluded) fail('운영 빌드에 개발용 가짜 데이터·테스트 계정이 들어갔어요 — __SAYEON_MOCK__ 로 감싸지 않은 mock import 를 찾아 고쳐 주세요');
if (bundle.includes('dev-login') || bundle.includes('dev-accounts')) fail('운영 빌드에 개발 화면 테스트 사번 로그인 호출이 들어갔어요 — __SAYEON_DEV_API__ 로 감싸 주세요');
// 보안: 소스맵(원본 코드 지도)이 없어야 한다
const maps = fs.readdirSync(path.join(DIST, 'assets')).filter((f) => f.endsWith('.map'));
if (maps.length || bundle.includes('sourceMappingURL')) fail('운영 빌드에 소스맵이 들어갔어요 — vite.config.js 의 build.sourcemap 을 false 로');

// 로그인 방식
const ssoMode = T.sso.mode ?? 'browser';
const employeeApi = T.sso.employeeApi ?? {};
if (ssoMode === 'browser' && !String(employeeApi.url ?? '').trim()) {
  console.warn('  ⚠ servers.config.mjs 의 sso.employeeApi.url 이 비어 있어요 — 모든 사용자가 "임직원만 이용할 수 있어요" 화면으로 가요');
}
const licKey = (() => {
  try {
    return /licenseKey = '([^']+)'/.exec(fs.readFileSync(path.join(CLIENT, 'src', '.devextreme', 'license-key.js'), 'utf8'))?.[1] ?? null;
  } catch {
    return null;
  }
})();
const licensed = Boolean(licKey && licKey !== 'TRIAL' && bundle.includes(licKey.slice(0, 40)));
if (!licensed) console.warn('  ⚠ DevExtreme 라이선스 키가 빌드에 없어요 — 화면 위에 평가판 배너가 떠요 (docs/GO-LIVE.md)');

// 1) 화면 설정 (빌드에 들어 있던 개발용 sayeon.config.js 를 덮어쓴다) — 배포 뒤 이 파일만 고쳐도 반영된다
const runtime = {
  apiBase: T.apiUrl,
  adminPath: T.adminPath,
  ...(ssoMode === 'browser' && { employeeApi, ...(T.sso.employeeCheck?.url && { employeeCheck: T.sso.employeeCheck }) }),
  security: { blockDevtools: T.security.blockDevtools },
  ...(T.sso.loginPage && { ssoLoginPage: T.sso.loginPage }),
};
fs.writeFileSync(path.join(DIST, 'sayeon.config.js'), `window.SAYEON_CONFIG = ${JSON.stringify(runtime, null, 2)};\n`);

// 2) IIS 설정 — 화면 파일만 낸다. 사용자 브라우저가 API 서버를 직접 부르므로 /api 전달·ARR 은 없다
//    보안 헤더: 화면이 부를 수 있는 곳(CSP connect-src)을 자기 자신 · API 서버 · 사내 인사정보 URL 로만 제한
const originOf = (u) => {
  try {
    return new URL(u).origin;
  } catch {
    return '';
  }
};
const connect = [...new Set(["'self'", originOf(T.apiUrl), originOf(employeeApi.url ?? ''), originOf(T.sso.employeeCheck?.url ?? '')].filter(Boolean))];
const csp = [
  "default-src 'self'", "script-src 'self'", "style-src 'self' 'unsafe-inline'", "img-src 'self' data: blob:", "font-src 'self' data:",
  `connect-src ${connect.join(' ')}`, "object-src 'none'", "base-uri 'self'", "form-action 'self'", "frame-ancestors 'none'",
].join('; ');
const xmlAttr = (v) => v.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
const webConfig = `<?xml version="1.0" encoding="UTF-8"?>
<!--
  사緣 Web 서버(IIS) 설정 — npm run build 가 servers.config.mjs(${target})로 만든 파일. 직접 고치지 말고 마스터를 고쳐 다시 빌드.
  필요: IIS(정적 콘텐츠) · URL Rewrite(화면 주소 새로 고침)  → _deploy/check-web.ps1 이 확인
  /api 는 이 서버를 거치지 않는다 — 사용자 PC 브라우저 → ${T.apiUrl}/api  (API 서버 방화벽: 사용자 PC 대역 → ${T.api.port})
  로그인 방식 ${ssoMode}: 화면이 사내 인사정보 URL 로 임직원을 확인한다 (Windows 인증 필요 없음 · 익명 인증 그대로)
-->
<configuration>
  <system.webServer>
    <rewrite>
      <!-- 보안: 응답의 Server 헤더(IIS 버전)를 비운다 -->
      <outboundRules>
        <rule name="sayeon-hide-server">
          <match serverVariable="RESPONSE_SERVER" pattern=".+" />
          <action type="Rewrite" value="" />
        </rule>
      </outboundRules>
      <rules>
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
        <!-- 원본 코드 지도·설정 파일은 내려주지 않는다 -->
        <fileExtensions allowUnlisted="true">
          <add fileExtension=".map" allowed="false" />
          <add fileExtension=".config" allowed="false" />
          <add fileExtension=".ps1" allowed="false" />
          <add fileExtension=".json" allowed="false" />
        </fileExtensions>
        <verbs allowUnlisted="false">
          <add verb="GET" allowed="true" />
          <add verb="HEAD" allowed="true" />
        </verbs>
      </requestFiltering>
    </security>
    <directoryBrowse enabled="false" />
    <staticContent>
      <remove fileExtension=".woff2" />
      <mimeMap fileExtension=".woff2" mimeType="font/woff2" />
      <remove fileExtension=".woff" />
      <mimeMap fileExtension=".woff" mimeType="font/woff" />
      <clientCache cacheControlMode="UseMaxAge" cacheControlMaxAge="7.00:00:00" />
    </staticContent>
    <httpProtocol>
      <customHeaders>
        <remove name="X-Powered-By" />
        <add name="X-Content-Type-Options" value="nosniff" />
        <add name="X-Frame-Options" value="DENY" />
        <add name="Referrer-Policy" value="no-referrer" />
        <add name="Permissions-Policy" value="camera=(), microphone=(), geolocation=(), payment=(), usb=()" />
        <add name="Cross-Origin-Opener-Policy" value="same-origin" />
        <add name="Content-Security-Policy" value="${xmlAttr(csp)}" />
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
const build = { buildId, target, builtAt: d.toISOString(), commit, ssoMode, employeeUrl: employeeApi.url ?? '', licensed, web: T.publicUrl, api: T.apiUrl };
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
  __ENV__: target, __SSO_MODE__: ssoMode, __EMPLOYEE_URL__: String(employeeApi.url ?? ''),
  __BUILD_ID__: buildId, __PUBLIC_URL__: T.publicUrl,
};
for (const name of ['check-web.ps1', 'deploy-web.ps1']) {
  let s = fs.readFileSync(path.join(CLIENT, 'scripts', 'templates', name), 'utf8').replace(/^﻿/, '');
  for (const [k, v] of Object.entries(values)) s = s.split(k).join(v.replace(/'/g, "''"));
  fs.writeFileSync(path.join(deployDir, name), BOM + s.replace(/\r?\n/g, '\r\n'));
}

console.log(`  ✔ web.config · sayeon.config.js(로그인 ${ssoMode}) · _deploy/ (점검 스크립트 · 파일 ${Object.keys(files).length}개 목록)`);
console.log(`  ✔ 빌드 ${buildId} · 운영 모드${licensed ? '' : ' · ⚠ 라이선스 없음'}\n`);
