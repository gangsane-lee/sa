/**
 * 저장소 — 서비스 데이터를 MSSQL에 저장한다.
 *
 * 방식: 서버가 시작할 때 SA_DOC 테이블 전체를 메모리로 읽고, 요청이 끝날 때마다
 *       '바뀐 문서만' 한 트랜잭션으로 저장(MERGE/DELETE)한다.
 *  - 신청자·매칭·하트·쪽지 하나하나가 SA_DOC 한 행(JSON)이다 → 화면 test 모드와 같은 업무 코드를 그대로 쓴다
 *  - 상태를 메모리에 두므로 PM2는 반드시 인스턴스 1개(fork)로 돌린다 (ecosystem.config.cjs)
 *  - 이름·메일 등은 DATA_KEY로 암호화해 저장한다
 *  - 사내 규모(신청자 수천 명)를 기준으로 한 설계. 수만 명 이상이면 정규화 테이블로 옮길 것
 */
import sql from 'mssql';
import { makeCipher } from './crypto.js';

/** 컬렉션 구성 — 배열(키 필드) / 맵(키=객체 키) / 단일 문서 */
const ARRAYS = {
  applicants: 'id', matches: 'id', hearts: 'id', reviews: 'id', vocs: 'id', messages: 'id', auditLogs: 'id',
  employees: 'empNo', blacklist: 'empNo',
};
const MAPS = ['daily', 'seen', 'sajuPicks', 'penalties', 'adminLocks'];
const SINGLES = ['settings', 'seq', 'codes'];
/** 암호화해서 저장할 필드 */
const SECRET = { applicants: ['name'], employees: ['name', 'email'], vocs: ['author'] };
const SEP = '\u0001';

/** db 객체 → { 'coll\u0001id': JSON } (평문 기준으로 바뀐 것을 비교한다) */
function snapshot(db) {
  const out = new Map();
  for (const [coll, keyField] of Object.entries(ARRAYS)) {
    for (const item of db[coll] ?? []) out.set(`${coll}${SEP}${item[keyField]}`, JSON.stringify(item));
  }
  for (const coll of MAPS) {
    for (const [k, v] of Object.entries(db[coll] ?? {})) out.set(`${coll}${SEP}${k}`, JSON.stringify(v));
  }
  for (const coll of SINGLES) if (db[coll] !== undefined) out.set(`${coll}${SEP}main`, JSON.stringify(db[coll]));
  return out;
}

function sealDoc(cipher, coll, json) {
  const fields = SECRET[coll];
  if (!fields || !cipher.enabled) return json;
  const o = JSON.parse(json);
  for (const f of fields) if (typeof o[f] === 'string') o[f] = cipher.enc(o[f]);
  return JSON.stringify(o);
}
function openDoc(cipher, coll, obj) {
  for (const f of SECRET[coll] ?? []) if (typeof obj[f] === 'string') obj[f] = cipher.dec(obj[f]);
  return obj;
}

/** 저장된 행들 → db 객체 */
function rebuild(rows, cipher) {
  if (!rows.length) return null;
  const db = {};
  for (const coll of Object.keys(ARRAYS)) db[coll] = [];
  for (const coll of MAPS) db[coll] = {};
  for (const { COLL: coll, DOC_ID: id, BODY: body } of rows) {
    const doc = openDoc(cipher, coll, JSON.parse(body));
    if (ARRAYS[coll]) db[coll].push(doc);
    else if (MAPS.includes(coll)) db[coll][id] = doc;
    else if (SINGLES.includes(coll)) db[coll] = doc;
  }
  const byId = (a, b) => a.id - b.id;
  for (const coll of ['applicants', 'matches', 'hearts', 'reviews', 'vocs', 'messages']) db[coll].sort(byId);
  db.vocs.reverse(); // 개선의 소리는 최신 글이 앞
  db.auditLogs.sort((a, b) => b.id - a.id); // 열람 기록은 최신이 앞
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
const SAFE_DB_NAME = /^[A-Za-z0-9_]{1,100}$/;

function poolConfig(c, database) {
  return {
    server: c.server,
    port: c.port,
    database,
    user: c.user,
    password: c.password,
    options: { encrypt: c.encrypt, trustServerCertificate: c.trustServerCertificate, enableArithAbort: true },
    pool: { max: 10, min: 0, idleTimeoutMillis: 30000 },
    connectionTimeout: 15000,
    requestTimeout: 30000,
  };
}

async function ensureDatabase(c) {
  if (!SAFE_DB_NAME.test(c.database)) throw new Error(`DB_NAME에는 영문·숫자·_만 쓸 수 있어요: ${c.database}`);
  const master = await new sql.ConnectionPool(poolConfig(c, 'master')).connect();
  try {
    const r = await master.request().input('n', sql.NVarChar(128), c.database).query('SELECT DB_ID(@n) AS id');
    if (r.recordset[0].id === null) {
      await master.request().batch(`CREATE DATABASE [${c.database}]`);
      console.log(`[store] 데이터베이스를 만들었어요: ${c.database}`);
    }
  } finally {
    await master.close();
  }
}

const CREATE_TABLE = `
IF OBJECT_ID(N'dbo.SA_DOC', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.SA_DOC (
    COLL       VARCHAR(30)    NOT NULL,
    DOC_ID     NVARCHAR(100)  NOT NULL,
    BODY       NVARCHAR(MAX)  NOT NULL,
    UPDATED_AT DATETIME2      NOT NULL CONSTRAINT DF_SA_DOC_UPDATED DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_SA_DOC PRIMARY KEY (COLL, DOC_ID)
  );
END`;

const UPSERT = `
MERGE dbo.SA_DOC WITH (HOLDLOCK) AS t
USING (SELECT @c AS COLL, @i AS DOC_ID) AS s ON t.COLL = s.COLL AND t.DOC_ID = s.DOC_ID
WHEN MATCHED THEN UPDATE SET BODY = @b, UPDATED_AT = SYSUTCDATETIME()
WHEN NOT MATCHED THEN INSERT (COLL, DOC_ID, BODY) VALUES (@c, @i, @b);`;

async function mssqlStore(c, cipher) {
  if (!c.user) throw new Error('DB_USER가 비어 있어요. server/.env 를 확인해 주세요.');
  if (c.autoCreate) await ensureDatabase(c);
  const pool = await new sql.ConnectionPool(poolConfig(c, c.database)).connect();
  await pool.request().batch(CREATE_TABLE);
  const { recordset } = await pool.request().query('SELECT COLL, DOC_ID, BODY FROM dbo.SA_DOC');
  const loaded = rebuild(recordset, cipher);
  let saved = loaded ? snapshot(loaded) : new Map();
  let current = null; // 저장할 db (persist가 알려준다)
  let writing = Promise.resolve(); // 저장이 겹치지 않게 줄 세운다

  async function write(db) {
    const next = snapshot(db);
    const upserts = [];
    for (const [k, v] of next) if (saved.get(k) !== v) upserts.push([k, v]);
    const deletes = [...saved.keys()].filter((k) => !next.has(k));
    if (!upserts.length && !deletes.length) return;

    const tx = new sql.Transaction(pool);
    await tx.begin();
    try {
      for (const [key, json] of upserts) {
        const [coll, id] = key.split(SEP);
        await new sql.Request(tx)
          .input('c', sql.VarChar(30), coll)
          .input('i', sql.NVarChar(100), id)
          .input('b', sql.NVarChar(sql.MAX), sealDoc(cipher, coll, json))
          .query(UPSERT);
      }
      for (const key of deletes) {
        const [coll, id] = key.split(SEP);
        await new sql.Request(tx).input('c', sql.VarChar(30), coll).input('i', sql.NVarChar(100), id)
          .query('DELETE FROM dbo.SA_DOC WHERE COLL = @c AND DOC_ID = @i');
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
      const r = await pool.request().query('SELECT COUNT(*) AS n FROM dbo.SA_DOC');
      return { ok: true, store: 'mssql', database: c.database, docs: r.recordset[0].n };
    },
    close: () => pool.close(),
  };
}

/** 점검 스크립트용 (DB 없이 저장 형식 확인) */
export const __internals = { snapshot, rebuild, sealDoc, SEP };

export async function openStore(config) {
  const cipher = makeCipher(config.dataKey);
  if (config.store === 'memory') {
    console.warn('[store] STORE=memory — 데이터가 메모리에만 있고 재시작하면 사라져요 (점검용)');
    return memoryStore();
  }
  if (!cipher.enabled) console.warn('[store] DATA_KEY가 비어 있어 이름·메일을 평문으로 저장해요. 운영 전에 꼭 채워 주세요.');
  return mssqlStore(config.db, cipher);
}
