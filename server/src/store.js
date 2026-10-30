/**
 * 저장소 — 서비스 데이터를 MSSQL 에 저장한다. 표 구성: shared/db/tables.js (목적별 표 — 신청서 · 매칭 · 하트 · 쪽지 …)
 *
 * 방식: 서버가 시작할 때 사緣 표 전체를 메모리로 읽고, 요청이 끝날 때마다
 *       '바뀐 행만' 한 트랜잭션으로 저장(MERGE/DELETE)한다.
 *  - 행 하나 = 신청서 하나 · 매칭 하나 · 쪽지 하나 … 전체 원본은 DATA_JSON, 앞쪽 열은 SSMS 에서 보기 좋게 꺼낸 값
 *  - 화면 개발 모드(mock)와 같은 업무 코드를 그대로 쓴다
 *  - 상태를 메모리에 두므로 이 DB 를 쓰는 서버 프로세스는 반드시 1개
 *    (iisnode nodeProcessCountPerApplication="1" · 앱 풀 겹치는 재생 사용 안 함 · 같은 DB 로 다른 서버를 띄우지 않는다)
 *  - 이름·메일 등은 DATA_KEY 로 암호화해 저장한다
 *  - 예전 문서 표(SA_DOC 한 개)에 데이터가 있고 새 표가 비어 있으면, 처음 시작할 때 새 표로 옮긴다 (SA_DOC 은 백업으로 남긴다)
 */
import sql from 'mssql';
import { makeCipher, ENC_PREFIX } from './crypto.js';
import { explainDbError, DbSetupError } from './dbErrors.js';
import { TABLES, keyColsOf, rowsOf, dbFromRows, cellOf, createTableSql } from '../shared/db/tables.js';

/** 암호화해서 저장할 필드 */
const SECRET = { applicants: ['name'], employees: ['name', 'email'], vocs: ['author'] };
const SEP = '\u0001';
/** 예전 문서 표 (한 표에 모두 JSON) — 옮기기용으로만 읽는다 */
export const LEGACY_TABLE = 'dbo.SA_DOC';

export { TABLES };
/** 모든 표 만들기 SQL — db:setup · sql/setup.sql 과 같은 정의 */
export const CREATE_TABLES_SQL = TABLES.map(createTableSql).join('\n');

function sealDoc(cipher, coll, doc) {
  const fields = SECRET[coll];
  if (!fields || !cipher.enabled || !doc || typeof doc !== 'object') return doc;
  const o = { ...doc };
  for (const f of fields) if (typeof o[f] === 'string' && o[f]) o[f] = cipher.enc(o[f]);
  return o;
}
function openDoc(cipher, coll, obj) {
  for (const f of SECRET[coll] ?? []) {
    if (typeof obj?.[f] !== 'string' || !obj[f]) continue;
    if (!cipher.enabled && obj[f].startsWith(ENC_PREFIX)) {
      throw new DbSetupError({
        title: 'DATA_KEY가 비어 있는데 DB에는 암호화된 데이터가 있어요',
        reason: '이전에 DATA_KEY로 암호화해 저장한 데이터를 키 없이 읽으려고 했어요.',
        fix: ['.env 의 DATA_KEY 에 처음 쓰던 키를 그대로 넣어 주세요. (키를 잃어버렸다면 이름·메일은 복구할 수 없어요)'],
      });
    }
    if (!obj[f].startsWith(ENC_PREFIX)) continue; // 키를 넣기 전에 저장된 평문
    try {
      obj[f] = cipher.dec(obj[f]);
    } catch (e) {
      throw new DbSetupError({
        title: 'DATA_KEY가 저장된 데이터를 암호화한 키와 달라요',
        reason: `${coll} 행을 풀지 못했어요. DATA_KEY를 바꿨거나 다른 서버의 키를 넣었을 때 생겨요.`,
        fix: ['.env 의 DATA_KEY 를 처음 쓰던 값으로 되돌려 주세요. (DATA_KEY는 한 번 정하면 바꾸지 않아요)'],
      }, e);
    }
  }
  return obj;
}

/** db 객체 → { '표\u0001키': { t, row, json } } (평문 기준으로 바뀐 것을 비교한다) */
function snapshot(db) {
  const out = new Map();
  const rows = rowsOf(db);
  for (const t of TABLES) {
    for (const row of rows.get(t.table)) {
      out.set(`${t.table}${SEP}${row.id}`, { t, row, json: JSON.stringify(row.doc) + (row.pos === undefined ? '' : `#${row.pos}`) });
    }
  }
  return out;
}

/** 예전 문서 표(SA_DOC) 행 → db 객체 */
function legacyRebuild(rows, cipher) {
  const LIST = { applicants: 'id', matches: 'id', hearts: 'id', reviews: 'id', vocs: 'id', messages: 'id', auditLogs: 'id', employees: 'empNo', blacklist: 'empNo' };
  const MAPS = ['daily', 'seen', 'sajuPicks', 'penalties', 'adminLocks'];
  const db = {};
  for (const coll of Object.keys(LIST)) db[coll] = [];
  for (const coll of MAPS) db[coll] = {};
  for (const { COLL: coll, DOC_ID: id, BODY: body } of rows) {
    const doc = openDoc(cipher, coll, JSON.parse(body));
    if (LIST[coll]) db[coll].push(doc);
    else if (MAPS.includes(coll)) db[coll][id] = doc;
    else db[coll] = doc; // settings · seq · codes
  }
  for (const coll of ['applicants', 'matches', 'hearts', 'reviews', 'messages']) db[coll].sort((a, b) => a.id - b.id);
  db.vocs.sort((a, b) => b.id - a.id);
  db.auditLogs.sort((a, b) => b.id - a.id);
  return db;
}

// ── 메모리 저장소 (점검용 · 재시작하면 사라짐) ─────────────
function memoryStore() {
  return {
    kind: 'memory',
    loaded: null,
    persist() {},
    async flush() {},
    async health() {
      return { ok: true, store: 'memory' };
    },
    async close() {},
  };
}

// ── MSSQL 저장소 ─────────────────────────────────────────
export const SAFE_DB_NAME = /^[A-Za-z0-9_]{1,100}$/;

/**
 * 접속 설정. user/password 를 따로 주면 그 계정으로 (db:setup 의 관리 계정)
 * c.authentication · c.domain · c.options 는 그 앱(main.js)이 넘겨준 mssql 설정을 그대로 쓸 때 (src/plugin.js)
 */
export function poolConfig(c, database, { user = c.user, password = c.password, timeoutMs = 15000 } = {}) {
  return {
    server: c.server,
    port: c.port,
    database,
    user,
    password,
    ...(c.domain && { domain: c.domain }),
    ...(c.authentication && user === c.user && { authentication: c.authentication }),
    options: { ...(c.options ?? {}), encrypt: c.encrypt, trustServerCertificate: c.trustServerCertificate, enableArithAbort: true },
    pool: { max: 10, min: 0, idleTimeoutMillis: 30000 },
    connectionTimeout: timeoutMs,
    requestTimeout: 30000,
  };
}

const ctxOf = (c) => ({ host: c.server, port: c.port, user: c.user, database: c.database });
/** DB 작업 하나를 실행하고, 실패하면 원인·해결을 담은 오류로 바꾼다 */
async function step(c, fn) {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof DbSetupError) throw e;
    throw new DbSetupError(explainDbError(e, ctxOf(c)), e);
  }
}

async function ensureDatabase(c) {
  const master = await step(c, () => new sql.ConnectionPool(poolConfig(c, 'master')).connect());
  try {
    const r = await step(c, () => master.request().input('n', sql.NVarChar(128), c.database).query('SELECT DB_ID(@n) AS id'));
    if (r.recordset[0].id === null) {
      await step(c, () => master.request().batch(`CREATE DATABASE [${c.database}]`));
      console.log(`[store] 데이터베이스를 만들었어요: ${c.database}`);
    }
  } finally {
    await master.close().catch(() => {});
  }
}

/** 열 형식 → mssql 매개변수 형식 */
const paramType = (type) => {
  const [kind, n] = String(type).split(':');
  if (kind === 'int') return sql.Int;
  if (kind === 'bit') return sql.Bit;
  if (kind === 'time') return sql.DateTime2(3);
  return sql.NVarChar(kind === 'secret' ? 1000 : Number(n) || 400);
};

/** 표마다 저장(MERGE) · 삭제 SQL — 매개변수 @p0… = 열 순서, @d = DATA_JSON */
const statements = new Map(
  TABLES.map((t) => {
    const keys = keyColsOf(t).map(([n]) => n);
    const idx = (n) => t.cols.findIndex(([c]) => c === n);
    const on = keys.map((k) => `t.${k} = @p${idx(k)}`).join(' AND ');
    const sets = t.cols.filter(([n]) => !keys.includes(n)).map(([n]) => `${n} = @p${idx(n)}`);
    return [
      t.table,
      {
        merge: `MERGE dbo.${t.table} WITH (HOLDLOCK) AS t
USING (SELECT 1 AS one) AS s ON ${on}
WHEN MATCHED THEN UPDATE SET ${[...sets, 'DATA_JSON = @d', 'SAVED_AT = SYSUTCDATETIME()'].join(', ')}
WHEN NOT MATCHED THEN INSERT (${t.cols.map(([n]) => n).join(', ')}, DATA_JSON) VALUES (${t.cols.map((_, i) => `@p${i}`).join(', ')}, @d);`,
        del: `DELETE FROM dbo.${t.table} WHERE ${keys.map((k) => `${k} = @p${idx(k)}`).join(' AND ')}`,
      },
    ];
  }),
);

async function mssqlStore(c, cipher) {
  if (!c.user && !c.authentication) {
    throw new DbSetupError({ title: 'DB_USER가 비어 있어요', reason: '.env 에 DB 계정이 없어요.', fix: ['.env 의 DB_USER · DB_PASSWORD 를 채우거나, 그 앱 main.js 에서 DB 설정을 넘겨 주세요 (설치안내.txt 2번).'] });
  }
  if (!SAFE_DB_NAME.test(c.database)) {
    throw new DbSetupError({ title: 'DB 이름 형식이 맞지 않아요', reason: `${c.database}`, fix: ['servers.config.mjs 의 db.name 에는 영문·숫자·_ 만 쓸 수 있어요. (예: sasystem)'] });
  }
  if (c.autoCreate) await ensureDatabase(c);
  const pool = await step(c, () => new sql.ConnectionPool(poolConfig(c, c.database)).connect());
  const q = (text) => step(c, () => pool.request().query(text));

  // 표가 없을 때만 만든다 — 읽기·쓰기 권한만 있는 전용 계정도 표가 이미 있으면 그대로 시작한다
  const made = [];
  for (const t of TABLES) {
    if ((await q(`SELECT OBJECT_ID(N'dbo.${t.table}', N'U') AS id`)).recordset[0].id === null) {
      await step(c, () => pool.request().batch(createTableSql(t)));
      made.push(t.table);
    }
  }
  if (made.length) console.log(`[store] 표를 만들었어요: ${made.join(', ')}`);

  // 읽기
  const rowsByTable = new Map();
  for (const t of TABLES) {
    const keys = keyColsOf(t).map(([n]) => n);
    const hasPos = t.cols.some(([n]) => n === 'POS');
    const { recordset } = await q(`SELECT ${[...keys, ...(hasPos ? ['POS'] : []), 'DATA_JSON'].join(', ')} FROM dbo.${t.table}`);
    rowsByTable.set(t.table, recordset.map((r) => ({ keys: keys.map((k) => r[k]), pos: r.POS, doc: openDoc(cipher, t.coll, JSON.parse(r.DATA_JSON)) })));
  }
  let loaded = dbFromRows(rowsByTable);
  let saved = loaded ? snapshot(loaded) : new Map();

  // 예전 문서 표에서 옮기기 — 새 표가 모두 비어 있을 때만 (saved 가 비어 있으므로 첫 저장 때 전부 쓴다)
  if (!loaded && (await q(`SELECT OBJECT_ID(N'${LEGACY_TABLE}', N'U') AS id`)).recordset[0].id !== null) {
    const { recordset } = await q(`SELECT COLL, DOC_ID, BODY FROM ${LEGACY_TABLE}`);
    if (recordset.length) {
      loaded = legacyRebuild(recordset, cipher);
      console.log(`[store] 예전 표 ${LEGACY_TABLE} 의 ${recordset.length}건을 목적별 표로 옮겨요 (${LEGACY_TABLE} 은 백업으로 그대로 둬요 — 확인 뒤 지워도 돼요)`);
    }
  }

  let current = null; // 저장할 db (persist가 알려준다)
  let writing = Promise.resolve(); // 저장이 겹치지 않게 줄 세운다

  async function write(db) {
    const next = snapshot(db);
    const upserts = [];
    for (const [k, v] of next) if (saved.get(k)?.json !== v.json) upserts.push(v);
    const deletes = [...saved.entries()].filter(([k]) => !next.has(k)).map(([, v]) => v);
    if (!upserts.length && !deletes.length) return;

    const tx = new sql.Transaction(pool);
    await tx.begin();
    try {
      for (const { t, row } of upserts) {
        const sealed = { ...row, doc: sealDoc(cipher, t.coll, row.doc) };
        const req = new sql.Request(tx);
        t.cols.forEach((col, i) => req.input(`p${i}`, paramType(col[2]), cellOf(t, sealed, col)));
        req.input('d', sql.NVarChar(sql.MAX), JSON.stringify(sealed.doc));
        await req.query(statements.get(t.table).merge);
      }
      for (const { t, row } of deletes) {
        const req = new sql.Request(tx);
        t.cols.forEach((col, i) => req.input(`p${i}`, paramType(col[2]), cellOf(t, row, col)));
        await req.query(statements.get(t.table).del);
      }
      await tx.commit();
      saved = next;
    } catch (e) {
      await tx.rollback().catch(() => {});
      throw e;
    }
  }

  return {
    kind: 'mssql',
    loaded,
    /** 서비스가 데이터를 바꿀 때마다 부른다 — 실제 저장은 요청이 끝날 때 flush()에서 한 번에 */
    persist(db) {
      current = db;
    },
    /** 바뀐 내용을 DB에 쓴다. 앞선 저장이 끝난 뒤 차례로 처리한다 */
    flush() {
      const job = writing.then(async () => {
        if (!current) return;
        const db = current;
        current = null;
        try {
          await write(db);
        } catch (e) {
          current = current ?? db; // 실패하면 다음 요청 때 다시 시도
          throw e;
        }
      });
      writing = job.catch(() => {});
      return job;
    },
    async health() {
      await pool.request().query('SELECT TOP (1) 1 AS ok FROM dbo.SA_SETTING');
      return { ok: true, store: 'mssql' };
    },
    close: () => pool.close(),
  };
}

/** 점검 스크립트용 (DB 없이 저장 형식 확인) */
export const __internals = { snapshot, sealDoc, openDoc, legacyRebuild, SEP, SECRET };

export async function openStore(config) {
  const cipher = makeCipher(config.dataKey);
  if (config.store === 'memory') {
    console.warn('[store] STORE=memory — 데이터가 메모리에만 있고 재시작하면 사라져요 (점검용)');
    return memoryStore();
  }
  if (!cipher.enabled) console.warn('[store] DATA_KEY가 비어 있어 이름·메일을 평문으로 저장해요. 운영 전에 꼭 채워 주세요.');
  return mssqlStore(config.db, cipher);
}
