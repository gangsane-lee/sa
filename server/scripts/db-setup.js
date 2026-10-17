/**
 * DB 준비 — server 폴더에서  npm run db:setup
 *
 * .env 의 DB 설정대로 데이터베이스 · 앱 전용 로그인 · DB 사용자 · 권한 · 테이블(dbo.SA_DOC)을 만든다.
 * 이미 있는 것은 건너뛰므로 여러 번 실행해도 안전하다. 마지막에 앱 계정으로 읽기·쓰기까지 확인한다.
 *
 * 계정 두 가지
 *  - 관리 계정: DB·로그인을 만들 권한이 있는 계정(예: sa). .env 의 DB_ADMIN_USER / DB_ADMIN_PASSWORD
 *               비워 두면 DB_USER 로 진행한다. 준비가 끝나면 .env 에서 지운다
 *  - 앱 계정  : 서버가 평소에 쓰는 계정. .env 의 DB_USER / DB_PASSWORD
 *               관리 계정과 다르면 로그인을 만들고 이 DB의 읽기·쓰기 권한만 준다
 *
 * 옵션
 *  npm run db:setup -- --check            바꾸지 않고 상태와 할 일만 보여준다
 *  npm run db:setup -- --reset-password   앱 계정이 이미 있는데 비밀번호가 다르면 .env 의 DB_PASSWORD 로 바꾼다
 *
 * DB 담당자가 직접 만들 때는 server/sql/setup.sql (같은 작업의 SQL 버전)
 */
import { createReport } from './lib/report.js';

// 라이브러리는 실행 환경을 확인한 뒤에 불러온다 — npm run db:setup 은 scripts/run.mjs 가 먼저 확인한다
const sql = (await import('mssql')).default;
const { config } = await import('../src/config.js');
const { poolConfig, SAFE_DB_NAME, TABLE, CREATE_TABLE } = await import('../src/store.js');
const { explainDbError } = await import('../src/dbErrors.js');
const { inspectTable, TABLE_FIX } = await import('./lib/dbinspect.js');

const args = new Set(process.argv.slice(2));
const CHECK_ONLY = args.has('--check');
const RESET_PASSWORD = args.has('--reset-password');
const SAFE_LOGIN = /^[A-Za-z0-9_]{1,128}$/;
const APP_ROLES = ['db_datareader', 'db_datawriter'];

const c = config.db;
const r = createReport();
const qn = (name) => '[' + String(name).replace(/]/g, ']]') + ']'; // 식별자 감싸기
const lit = (s) => `N'${String(s).replace(/'/g, "''")}'`; // T-SQL 문자열 (CREATE LOGIN 비밀번호는 매개변수를 쓸 수 없다)
const finish = (code) => {
  process.exit(code);
};

console.log(`\n사緣 DB 준비${CHECK_ONLY ? ' (확인만 — 바꾸지 않아요)' : ''}`);

// ── 1. 설정 ────────────────────────────────────────────
r.section('설정 (server/.env)');
const adminUser = c.adminUser || c.user;
const adminPassword = c.adminUser ? c.adminPassword : c.password;
const separateApp = Boolean(c.adminUser) && c.adminUser.toLowerCase() !== c.user.toLowerCase();
{
  let bad = false;
  if (config.store !== 'mssql') r.warn(`STORE=${config.store} — 서버는 DB를 쓰지 않는 설정이에요`, { fix: ['운영에서는 STORE=mssql'] });
  if (!c.server) (bad = true), r.fail('DB 서버 주소가 비어 있어요', { fix: ['servers.config.mjs 의 db.host'] });
  if (!SAFE_DB_NAME.test(c.database)) (bad = true), r.fail(`DB 이름 형식이 맞지 않아요: ${c.database}`, { fix: ['servers.config.mjs 의 db.name — 영문·숫자·_ 만 (예: sasystem)'] });
  if (!c.user) (bad = true), r.fail('DB_USER(앱 계정)가 비어 있어요', { fix: ['예: DB_USER=sayeon_app'] });
  else if (!SAFE_LOGIN.test(c.user)) (bad = true), r.fail(`DB_USER 형식이 맞지 않아요: ${c.user}`, { fix: ['영문·숫자·_ 만 쓸 수 있어요'] });
  if (!c.password) (bad = true), r.fail('DB_PASSWORD 가 비어 있어요');
  if (c.adminUser && !c.adminPassword) (bad = true), r.fail('DB_ADMIN_USER 는 있는데 DB_ADMIN_PASSWORD 가 비어 있어요');
  if (bad) finish(r.summary({ failText: 'server/.env 를 고친 뒤 다시 실행해 주세요.' }));
  r.ok(`DB 서버 ${c.server}:${c.port} · 데이터베이스 ${c.database}`);
  r.ok(`관리 계정 ${adminUser}${c.adminUser ? ' (DB_ADMIN_USER)' : ' (DB_USER — DB_ADMIN_USER 가 비어 있어요)'} · 앱 계정 ${c.user}`);
  if (!separateApp && c.user.toLowerCase() === 'sa') {
    r.warn('서버가 sa 계정을 그대로 써요', {
      reason: 'sa 는 SQL Server 전체 권한이라, 비밀번호가 새면 다른 DB까지 위험해요.',
      fix: ['전용 계정 권장: .env 에 DB_ADMIN_USER=sa, DB_ADMIN_PASSWORD=(sa 비밀번호), DB_USER=sayeon_app, DB_PASSWORD=(새 비밀번호) 로 바꾸고 다시 실행'],
    });
  }
}

const ctx = (user) => ({ host: c.server, port: c.port, user, database: c.database });
let admin;
try {
  // ── 2. 관리 계정 연결 ────────────────────────────────
  r.section(`관리 계정(${adminUser})으로 연결`);
  try {
    admin = await new sql.ConnectionPool(poolConfig(c, 'master', { user: adminUser, password: adminPassword, timeoutMs: 10000 })).connect();
  } catch (e) {
    r.failDb(explainDbError(e, ctx(adminUser)));
    finish(r.summary({ failText: 'DB 서버에 연결하지 못했어요. 위 해결 방법을 확인해 주세요.' }));
  }
  const info = (await admin.request().query(`
    SELECT CAST(SERVERPROPERTY('ProductVersion') AS NVARCHAR(50)) AS ver,
           CAST(SERVERPROPERTY('Edition') AS NVARCHAR(100)) AS edition,
           IS_SRVROLEMEMBER('sysadmin') AS sysadmin,
           HAS_PERMS_BY_NAME(NULL, NULL, 'CREATE ANY DATABASE') AS canCreateDb,
           HAS_PERMS_BY_NAME(NULL, NULL, 'ALTER ANY LOGIN') AS canAlterLogin,
           SERVERPROPERTY('IsIntegratedSecurityOnly') AS winOnly`)).recordset[0];
  r.ok(`연결됨 · SQL Server ${info.ver} (${info.edition})`);
  if (info.sysadmin) r.ok('관리 계정 권한: sysadmin');
  else r.info(`관리 계정 권한: DB 생성 ${info.canCreateDb ? '있음' : '없음'} · 로그인 관리 ${info.canAlterLogin ? '있음' : '없음'}`);
  if (info.winOnly) r.warn('DB 서버가 Windows 인증만 받도록 되어 있어요', { fix: ["앱 계정(SQL 로그인)이 들어가려면 'SQL Server 및 Windows 인증 모드'로 바꿔야 해요"] });

  // ── 3. 데이터베이스 ──────────────────────────────────
  r.section(`데이터베이스 ${c.database}`);
  const dbId = (await admin.request().input('n', sql.NVarChar(128), c.database).query('SELECT DB_ID(@n) AS id')).recordset[0].id;
  if (dbId !== null) {
    const st = (await admin.request().input('n', sql.NVarChar(128), c.database)
      .query('SELECT state_desc AS state, is_read_only AS ro, collation_name AS coll FROM sys.databases WHERE name = @n')).recordset[0];
    if (st.state !== 'ONLINE') r.fail(`DB 상태가 ${st.state} 이에요`, { fix: ['DB 담당자에게 ONLINE 으로 바꿔 달라고 요청해 주세요.'] });
    else if (st.ro) r.fail('DB가 읽기 전용이에요', { fix: ['DB 담당자에게 읽기 전용 해제를 요청해 주세요.'] });
    else r.ok(`이미 있어요 (정렬 ${st.coll})`);
  } else if (CHECK_ONLY) {
    r.warn('아직 없어요 → 만들 예정');
  } else if (!info.canCreateDb) {
    r.fail('DB가 없고, 관리 계정에 만들 권한도 없어요', {
      fix: ['DB_ADMIN_USER 에 sa 처럼 DB를 만들 수 있는 계정을 넣거나, DB 담당자에게 server/sql/setup.sql 실행을 요청해 주세요.'],
    });
  } else {
    try {
      await admin.request().batch(`CREATE DATABASE [${c.database}]`);
      r.ok('만들었어요');
    } catch (e) {
      r.failDb(explainDbError(e, ctx(adminUser)));
    }
  }
  if (r.counts.fail) finish(r.summary({ failText: '데이터베이스를 준비하지 못했어요.' }));
  const dbReady = dbId !== null || !CHECK_ONLY;

  // ── 4. 앱 계정 로그인 ────────────────────────────────
  r.section(`앱 계정 로그인 ${c.user}`);
  const login = (await admin.request().input('n', sql.NVarChar(128), c.user)
    .query("SELECT name, is_disabled AS disabled, type_desc AS type, CAST(LOGINPROPERTY(name, 'IsMustChange') AS INT) AS mustChange FROM sys.server_principals WHERE name = @n AND type IN ('S','U','G')")).recordset[0];
  if (!separateApp) {
    if (!login) r.fail(`로그인 ${c.user} 이(가) DB 서버에 없어요`);
    else r.ok(`관리 계정과 같은 계정이라 따로 만들지 않아요${c.user.toLowerCase() === 'sa' ? ' (sa)' : ''}`);
  } else if (!login) {
    if (CHECK_ONLY) r.warn('아직 없어요 → 만들 예정');
    else if (!info.canAlterLogin) r.fail('로그인을 만들 권한이 없어요', { fix: ['DB_ADMIN_USER 에 sa 등 로그인 관리 권한이 있는 계정을 넣어 주세요.'] });
    else {
      try {
        await admin.request().batch(
          `CREATE LOGIN [${c.user}] WITH PASSWORD = ${lit(c.password)}, DEFAULT_DATABASE = [${c.database}], CHECK_POLICY = ON, CHECK_EXPIRATION = OFF`,
        );
        r.ok('만들었어요 (비밀번호 만료 없음 · 기본 DB ' + c.database + ')');
      } catch (e) {
        r.failDb(explainDbError(e, ctx(c.user)));
      }
    }
  } else {
    if (login.type !== 'SQL_LOGIN') r.warn(`SQL 로그인이 아니에요 (${login.type}) — 비밀번호로 들어갈 수 없어요`, { fix: ['DB_USER 에는 SQL Server 인증 로그인을 써 주세요.'] });
    else r.ok('이미 있어요');
    if (login.disabled) {
      if (CHECK_ONLY) r.warn('사용 중지 상태예요 → 사용으로 바꿀 예정');
      else {
        await admin.request().batch(`ALTER LOGIN [${c.user}] ENABLE`);
        r.ok('사용 중지 상태라 사용으로 바꿨어요');
      }
    }
    if (login.mustChange) r.warn("'다음 로그인 시 암호 변경'이 걸려 있어요", { fix: ['--reset-password 로 .env 의 DB_PASSWORD 를 다시 정해 주세요.'] });
    if (RESET_PASSWORD && !CHECK_ONLY) {
      try {
        await admin.request().batch(`ALTER LOGIN [${c.user}] WITH PASSWORD = ${lit(c.password)}, CHECK_POLICY = ON, CHECK_EXPIRATION = OFF`);
        r.ok('비밀번호를 .env 의 DB_PASSWORD 로 바꿨어요');
      } catch (e) {
        r.failDb(explainDbError(e, ctx(c.user)));
      }
    }
  }

  // ── 5. DB 사용자 · 권한 ──────────────────────────────
  r.section('DB 사용자 · 권한');
  if (!dbReady) {
    r.info('DB가 아직 없어 확인을 건너뛰어요');
  } else {
    const inDb = (q) => admin.request().input('n', sql.NVarChar(128), c.user).query(`USE [${c.database}]; ${q}`);
    const appIsSysadmin = (await admin.request().input('n', sql.NVarChar(128), c.user)
      .query("SELECT IS_SRVROLEMEMBER('sysadmin', @n) AS s")).recordset[0].s === 1;
    if (appIsSysadmin) {
      r.ok(`${c.user} 은(는) sysadmin 이라 모든 DB에 dbo 로 들어가요 (따로 줄 권한 없음)`);
    } else if (!login && CHECK_ONLY) {
      r.warn('로그인이 없어 사용자도 없어요 → 만들 예정');
    } else if (!(await admin.request().input('n', sql.NVarChar(128), c.user).query('SELECT SUSER_ID(@n) AS id')).recordset[0].id) {
      r.fail(`로그인 ${c.user} 이(가) 없어 DB 사용자를 만들 수 없어요`, { fix: ['위 4단계의 오류를 먼저 해결해 주세요.'] });
    } else {
      // 로그인과 SID가 같은 사용자(이름이 dbo 일 수도 있다) → 없으면 같은 이름의 끊긴 사용자 → 없으면 새로 만든다
      const mapped = (await inDb(`
        SELECT dp.name FROM sys.database_principals dp
        JOIN sys.server_principals sp ON sp.sid = dp.sid
        WHERE sp.name = @n`)).recordset[0];
      const byName = (await inDb('SELECT name FROM sys.database_principals WHERE name = @n')).recordset[0];
      let userName = mapped?.name;
      if (mapped) {
        r.ok(mapped.name === 'dbo' ? `${c.user} 은(는) 이 DB의 소유자(dbo)예요 — 모든 권한이 있어요` : `사용자 ${mapped.name} 이미 있어요`);
      } else if (byName) {
        // DB를 다른 서버에서 복원하면 사용자와 로그인의 연결이 끊긴다(고아 사용자)
        if (CHECK_ONLY) r.warn('사용자와 로그인의 연결이 끊겨 있어요(DB 복원 후 흔함) → 다시 연결할 예정');
        else {
          await inDb(`ALTER USER [${c.user}] WITH LOGIN = [${c.user}];`);
          r.ok('끊겨 있던 사용자-로그인 연결을 다시 이었어요 (DB 복원 후 흔한 상태)');
          userName = c.user;
        }
      } else if (CHECK_ONLY) {
        r.warn(`사용자 ${c.user} 이(가) 없어요 → 만들 예정`);
      } else {
        await inDb(`CREATE USER [${c.user}] FOR LOGIN [${c.user}] WITH DEFAULT_SCHEMA = dbo;`);
        r.ok(`사용자 ${c.user} 을(를) 만들었어요`);
        userName = c.user;
      }
      if (!userName && CHECK_ONLY) r.warn(`${APP_ROLES.join(' · ')} 권한 → 사용자를 만든 뒤 줄 예정`);
      for (const role of userName === 'dbo' || !userName ? [] : APP_ROLES) {
        const isMember = (await admin.request().input('u', sql.NVarChar(128), userName)
          .query(`USE [${c.database}]; SELECT IS_ROLEMEMBER('${role}', @u) AS m`)).recordset[0].m === 1;
        if (isMember) r.ok(`${role} 권한 있음`);
        else if (CHECK_ONLY) r.warn(`${role} 권한 없음 → 줄 예정`);
        else {
          await inDb(`ALTER ROLE [${role}] ADD MEMBER ${qn(userName)};`);
          r.ok(`${role} 권한을 줬어요`);
        }
      }
    }
  }

  // ── 6. 테이블 ───────────────────────────────────────
  r.section(`테이블 ${TABLE}`);
  if (!dbReady) {
    r.info('DB가 아직 없어 확인을 건너뛰어요');
  } else {
    const run = async (q) => (await admin.request().query(`USE [${c.database}]; ${q}`)).recordset;
    let t = await inspectTable(run);
    if (!t.exists) {
      if (CHECK_ONLY) r.warn('아직 없어요 → 만들 예정');
      else {
        try {
          await admin.request().batch(`USE [${c.database}]; ${CREATE_TABLE}`);
          r.ok('만들었어요');
          t = await inspectTable(run);
        } catch (e) {
          r.failDb(explainDbError(e, ctx(adminUser)));
        }
      }
    }
    if (t.exists && t.problems.length) {
      r.fail('테이블 구조가 서버가 기대하는 모양과 달라요', { reason: t.problems.join(' · '), fix: [TABLE_FIX] });
    } else if (t.exists) {
      r.ok(`구조 확인 · 문서 ${t.count}건${t.count ? '' : ' (서버를 처음 켜면 기본 기준정보·설정이 들어가요)'}`);
    }
  }

  // ── 7. 앱 계정으로 최종 확인 ─────────────────────────
  r.section(`앱 계정(${c.user})으로 최종 확인`);
  if (CHECK_ONLY && r.counts.warn) {
    r.info('확인만 하는 중이라 할 일이 남아 있어요 — --check 없이 다시 실행하면 진행해요');
  } else {
    let app;
    try {
      app = await new sql.ConnectionPool(poolConfig(c, c.database, { timeoutMs: 10000 })).connect();
      r.ok('로그인 성공');
      await app.request().query(`SELECT TOP (1) COLL FROM ${TABLE}`);
      r.ok('읽기 성공');
      const tx = new sql.Transaction(app);
      await tx.begin();
      try {
        await new sql.Request(tx).query(`INSERT INTO ${TABLE} (COLL, DOC_ID, BODY) VALUES ('__setup', 'probe', N'{}')`);
        await new sql.Request(tx).query(`UPDATE ${TABLE} SET BODY = N'{"ok":1}' WHERE COLL = '__setup' AND DOC_ID = 'probe'`);
        await new sql.Request(tx).query(`DELETE FROM ${TABLE} WHERE COLL = '__setup' AND DOC_ID = 'probe'`);
        r.ok('쓰기·수정·삭제 성공 (시험한 내용은 되돌렸어요)');
      } finally {
        await tx.rollback().catch(() => {});
      }
    } catch (e) {
      const ex = explainDbError(e, ctx(c.user));
      if (e.code === 'ELOGIN' && separateApp && !RESET_PASSWORD && !/Cannot open database|열 수 없/.test(e.message)) {
        ex.fix.unshift('로그인이 이미 있던 계정이면 비밀번호가 .env 와 다를 수 있어요 →  npm run db:setup -- --reset-password');
      }
      r.failDb(ex);
    } finally {
      await app?.close().catch(() => {});
    }
  }
} catch (e) {
  r.failDb(explainDbError(e, ctx(adminUser)));
} finally {
  await admin?.close().catch(() => {});
}

const code = r.summary({
  okText: CHECK_ONLY ? '확인을 마쳤어요. 할 일이 있으면 --check 없이 다시 실행해 주세요.' : 'DB 준비가 끝났어요.',
  failText: 'DB 준비가 끝나지 않았어요. ✖ 항목의 해결 방법을 확인해 주세요.',
});
if (!code && !CHECK_ONLY) {
  console.log('  다음 할 일');
  if (c.adminUser) console.log('   1) server/.env 에서 DB_ADMIN_USER · DB_ADMIN_PASSWORD 를 지우세요 (관리 계정 비밀번호를 남기지 않기)');
  console.log(`   ${c.adminUser ? 2 : 1}) server/.env 의 DB_AUTO_CREATE=false 로 바꾸세요 (서버는 만들 필요 없이 쓰기만)`);
  console.log(`   ${c.adminUser ? 3 : 2}) npm run check\n`);
}
finish(code);
