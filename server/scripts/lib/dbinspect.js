/**
 * 테이블 dbo.SA_DOC 구조 확인 — npm run check · npm run db:setup 공용
 * @param {(sqlText: string) => Promise<any[]>} run  대상 DB에서 쿼리를 실행해 recordset 을 돌려주는 함수
 * @returns {Promise<{ exists: boolean, problems: string[], count: number|null }>}
 */
import { TABLE, COLUMNS } from '../../src/store.js';

export async function inspectTable(run) {
  const exists = (await run(`SELECT OBJECT_ID(N'${TABLE}', N'U') AS id`))[0].id !== null;
  if (!exists) return { exists, problems: [], count: null };

  const cols = await run(`
    SELECT c.name, t.name AS type, c.max_length AS len, c.is_nullable AS nullable
    FROM sys.columns c JOIN sys.types t ON t.user_type_id = c.user_type_id
    WHERE c.object_id = OBJECT_ID(N'${TABLE}')`);
  const problems = [];
  for (const want of COLUMNS) {
    const got = cols.find((x) => x.name.toUpperCase() === want.name);
    // nvarchar 길이는 바이트로 나온다 (글자 수 × 2), MAX 는 -1
    const len = want.length === undefined ? undefined : want.length === -1 ? -1 : want.type.startsWith('n') ? want.length * 2 : want.length;
    if (!got) problems.push(`${want.name} 열이 없어요`);
    else if (got.type !== want.type || (len !== undefined && got.len !== len) || Boolean(got.nullable) !== want.nullable) {
      problems.push(`${want.name} 열이 ${got.type}(${got.len === -1 ? 'MAX' : got.len}) — 기대 ${want.type}${want.length ? `(${want.length === -1 ? 'MAX' : want.length})` : ''}`);
    }
  }
  const pk = (await run(`
    SELECT COUNT(*) AS n FROM sys.indexes i JOIN sys.index_columns ic ON ic.object_id = i.object_id AND ic.index_id = i.index_id
    WHERE i.object_id = OBJECT_ID(N'${TABLE}') AND i.is_primary_key = 1`))[0].n;
  if (pk !== 2) problems.push('기본키(COLL, DOC_ID)가 없어요');
  const count = problems.length ? null : (await run(`SELECT COUNT(*) AS n FROM ${TABLE}`))[0].n;
  return { exists, problems, count };
}

export const TABLE_FIX = '다른 용도로 같은 이름의 테이블을 쓰고 있는지 확인해 주세요. 비어 있는 테이블이면 지운 뒤  npm run db:setup  으로 다시 만들 수 있어요.';
