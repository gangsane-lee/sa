/**
 * sql/setup.sql 의 표 만들기 부분을 표 정의(shared/db/tables.js)로 다시 쓴다 — 표 정의를 바꾸면 실행
 *   server 폴더에서  npm run sql:tables         다시 쓰기
 *                    npm run sql:tables -- --check  바뀐 게 있는지만 (있으면 종료 코드 1)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TABLES, createTableSql } from '../shared/db/tables.js';

const FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'sql', 'setup.sql');
const BEGIN = '/* @@TABLES-BEGIN (npm run sql:tables 가 만든 부분 — 직접 고치지 않는다) */';
const END = '/* @@TABLES-END */';

export function tablesBlock() {
  const q = (s) => s.replace(/'/g, "''");
  return [
    BEGIN,
    ...TABLES.map((t) => [
      `SET @sql = N'USE ' + QUOTENAME(@DbName) + N';`,
      q(createTableSql(t)),
      `';`,
      'EXEC (@sql);',
      `PRINT N'✔ 표 dbo.${t.table} (${t.label})';`,
    ].join('\n')),
    END,
  ].join('\n');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const text = fs.readFileSync(FILE, 'utf8');
  const a = text.indexOf(BEGIN);
  const b = text.indexOf(END);
  if (a < 0 || b < 0) {
    console.error(`setup.sql 에 표시(${BEGIN} … ${END})가 없어요`);
    process.exit(1);
  }
  const next = text.slice(0, a) + tablesBlock() + text.slice(b + END.length);
  if (process.argv.includes('--check')) {
    console.log(next === text ? 'setup.sql 이 표 정의와 같아요' : 'setup.sql 이 표 정의와 달라요 — npm run sql:tables');
    process.exit(next === text ? 0 : 1);
  }
  fs.writeFileSync(FILE, next);
  console.log(`setup.sql 표 ${TABLES.length}개를 다시 썼어요`);
}
