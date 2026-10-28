/**
 * API 서버 web.config 만들기 — servers.config.mjs(기준정보)의 환경 값으로
 *   npm run webconfig                       운영(production) — 이 폴더의 web.config 를 새로 쓴다
 *   npm run webconfig -- --env development  개발
 *   npm run webconfig -- --out <파일>        다른 곳에 쓰기
 * 배포 패키지(npm run release)는 이 명령 없이도 환경에 맞는 web.config 를 넣어 준다.
 */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { resolveTopology } from '../shared/topology.js';
import { buildApiWebConfig } from './lib/webconfig.js';
import { SERVER_ROOT, MASTER_FILE } from '../src/config.js';

const arg = (name) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : null;
};
const envName = arg('env') ?? 'production';
if (!MASTER_FILE) {
  console.error('  ✖ servers.config.mjs 를 찾지 못했어요');
  process.exit(1);
}
const master = (await import(pathToFileURL(MASTER_FILE).href)).default;
const T = resolveTopology(master, envName);
for (const p of T.problems) console.warn(`  ⚠ ${p}`);
const out = path.resolve(arg('out') ?? path.join(SERVER_ROOT, 'web.config'));
fs.writeFileSync(out, buildApiWebConfig(T));
console.log(`  ✔ ${out} — 환경 ${envName} · 포트 ${T.api.port} · DB ${T.db.host}:${T.db.port}/${T.db.name}`);
