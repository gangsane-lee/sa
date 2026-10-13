/**
 * 배포 점검 — server 폴더에서  npm run check
 * .env 설정 요약 · DB 연결 · 테이블 · 화면 빌드 · 관리자 계정 파일을 확인한다 (비밀번호는 출력하지 않는다)
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import sql from 'mssql';
import { pathToFileURL } from 'node:url';
import { config, SERVER_ROOT } from '../src/config.js';

const ok = (m) => console.log(`  ✔ ${m}`);
const warn = (m) => console.log(`  ⚠ ${m}`);
const bad = (m) => console.log(`  ✖ ${m}`);
let failed = false;

console.log('\n[1] 서버 설정 (.env)');
ok(`주소 ${config.host}:${config.port} · 접속 주소 ${config.publicUrl}`);
ok(`화면 모드 ${config.serviceMode} · 관리자 주소 ${config.adminPath}`);
if (config.session.secretMissing) warn(`SESSION_SECRET 이 비어 있어요. 예: SESSION_SECRET=${crypto.randomBytes(32).toString('hex')}`);
else ok('SESSION_SECRET 설정됨');
if (!config.dataKey) warn(`DATA_KEY 가 비어 있어요(이름 평문 저장). 예: DATA_KEY=${crypto.randomBytes(32).toString('base64')}`);
else ok('DATA_KEY 설정됨');
ok(`SSO 모드 ${config.sso.mode} · 로그인 API ${config.sso.loginUrl || '(없음 — 로그인 화면 사용 불가)'}`);
if (config.sso.mode === 'header' && !config.sso.proxySecret) warn('SSO_MODE=header 인데 SSO_PROXY_SECRET 이 비어 있어 SSO 자동 로그인이 꺼져 있어요');
if (!config.sso.loginUrl && config.sso.mode === 'off') {
  warn('로그인 방법이 하나도 연결되지 않았어요 — AUTH_LOGIN_URL 또는 SSO_MODE 를 채워야 운영 모드에서 로그인할 수 있어요');
}

console.log('\n[2] DB 연결');
if (config.store !== 'mssql') warn(`STORE=${config.store} — DB를 쓰지 않아요`);
else {
  const c = config.db;
  ok(`${c.server}:${c.port} / DB ${c.database} / 계정 ${c.user || '(비어 있음)'}`);
  try {
    const pool = await new sql.ConnectionPool({
      server: c.server, port: c.port, database: 'master', user: c.user, password: c.password,
      options: { encrypt: c.encrypt, trustServerCertificate: c.trustServerCertificate },
      connectionTimeout: 10000,
    }).connect();
    const v = await pool.request().query("SELECT CAST(SERVERPROPERTY('ProductVersion') AS NVARCHAR(50)) AS v");
    ok(`DB 서버 연결 성공 (SQL Server ${v.recordset[0].v})`);
    const d = await pool.request().input('n', sql.NVarChar(128), c.database).query('SELECT DB_ID(@n) AS id');
    if (d.recordset[0].id === null) warn(`데이터베이스 ${c.database} 가 아직 없어요 — 서버를 처음 켤 때 만들어요 (DB_AUTO_CREATE=${c.autoCreate})`);
    else {
      const t = await pool.request().query(`SELECT COUNT(*) AS n FROM [${c.database}].sys.tables WHERE name = 'SA_DOC'`);
      if (t.recordset[0].n) {
        const n = await pool.request().query(`SELECT COUNT(*) AS n FROM [${c.database}].dbo.SA_DOC`);
        ok(`테이블 SA_DOC 있음 · 문서 ${n.recordset[0].n}건`);
      } else warn('테이블 SA_DOC 가 아직 없어요 — 서버를 처음 켤 때 만들어요');
    }
    await pool.close();
  } catch (e) {
    failed = true;
    bad(`DB 연결 실패: ${e.message}`);
    console.log('    → DB_HOST·DB_PORT·DB_USER·DB_PASSWORD, 방화벽(1433), SQL Server 인증 모드를 확인해 주세요');
  }
}

console.log('\n[3] 화면 빌드');
if (fs.existsSync(path.join(config.clientDist, 'index.html'))) ok(`있음: ${config.clientDist}`);
else {
  failed = true;
  bad(`없음: ${config.clientDist} — client 폴더에서 npm run build`);
}

console.log('\n[4] 관리자 계정 (config/admins.js)');
const adminsFile = path.join(SERVER_ROOT, 'config', 'admins.js');
if (!fs.existsSync(adminsFile)) warn('파일이 없어요 — admins.example.js 를 admins.js 로 복사해 채워 주세요');
else {
  const a = (await import(pathToFileURL(adminsFile).href)).default ?? {};
  const accounts = (a.accounts ?? []).filter((x) => x.empNo || x.adId);
  if (accounts.length) ok(`관리자 계정 ${accounts.length}개`);
  else warn('관리자 계정(accounts)이 비어 있어요 — 사번이나 사내 계정 ID를 채워 주세요');
  if (a.passwordHash) ok('관리자 비밀번호: 해시 방식');
  else if (a.password) warn('관리자 비밀번호: 평문 방식 (npm run hash-password 로 해시 방식 권장)');
  else warn('관리자 비밀번호가 비어 있어요 — 관리자 로그인이 꺼져 있어요');
}

console.log(failed ? '\n점검 결과: 고칠 곳이 있어요.\n' : '\n점검 결과: 시작할 준비가 됐어요. pm2 start ecosystem.config.cjs\n');
process.exit(failed ? 1 : 0);
