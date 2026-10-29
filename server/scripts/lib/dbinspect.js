/**
 * 사緣 표 구조 확인 — npm run check · npm run db:setup 공용 (표 정의: shared/db/tables.js)
 * @param {(sqlText: string) => Promise<any[]>} run  대상 DB에서 쿼리를 실행해 recordset 을 돌려주는 함수
 * @returns {Promise<{ tables: { table: string, label: string, exists: boolean, problems: string[], count: number|null }[], missing: string[], problems: string[], total: number }>}
 */
import { TABLES, keyColsOf } from '../../shared/db/tables.js';

export async function inspectTables(run) {
  const tables = [];
  for (const t of TABLES) {
    const exists = (await run(`SELECT OBJECT_ID(N'dbo.${t.table}', N'U') AS id`))[0].id !== null;
    if (!exists) {
      tables.push({ table: t.table, label: t.label, exists, problems: [], count: null });
      continue;
    }
    const cols = (await run(`SELECT c.name FROM sys.columns c WHERE c.object_id = OBJECT_ID(N'dbo.${t.table}')`)).map((x) => x.name.toUpperCase());
    const problems = [...t.cols.map(([n]) => n), 'DATA_JSON', 'SAVED_AT'].filter((n) => !cols.includes(n)).map((n) => `${t.table}.${n} 열이 없어요`);
    const pk = (await run(`
      SELECT COUNT(*) AS n FROM sys.indexes i JOIN sys.index_columns ic ON ic.object_id = i.object_id AND ic.index_id = i.index_id
      WHERE i.object_id = OBJECT_ID(N'dbo.${t.table}') AND i.is_primary_key = 1`))[0].n;
    if (pk !== keyColsOf(t).length) problems.push(`${t.table} 기본키(${keyColsOf(t).map(([n]) => n).join(', ')})가 맞지 않아요`);
    const count = problems.length ? null : (await run(`SELECT COUNT(*) AS n FROM dbo.${t.table}`))[0].n;
    tables.push({ table: t.table, label: t.label, exists, problems, count });
  }
  return {
    tables,
    missing: tables.filter((x) => !x.exists).map((x) => x.table),
    problems: tables.flatMap((x) => x.problems),
    total: tables.reduce((n, x) => n + (x.count ?? 0), 0),
  };
}

export const TABLE_FIX = '다른 용도로 같은 이름의 표를 쓰고 있는지 확인해 주세요. 비어 있는 표면 지운 뒤  npm run db:setup  으로 다시 만들 수 있어요.';
