/**
 * 설정을 어디서 읽는가 — 다른 iisnode(Express) 앱의 routes 폴더에 끼워 넣은 묶음일 때 (tools/plugin.mjs 가 runtime.js 대신 넣는다)
 *  - 기준정보(servers.config.mjs)와 환경(SAYEON_ENV)은 묶을 때 들어간다
 *  - 비밀번호·키는 묶음 폴더(routes/sayeon)의 .env — 그 앱의 환경 변수(DB_USER 등)와 섞이지 않게 process.env 에 넣지 않는다
 *  - 그 앱의 web.config 는 읽지 않는다 (DB 서버·이름을 바꾸려면 .env 의 DB_HOST · DB_PORT · DB_NAME)
 */
import fs from 'node:fs';
import path from 'node:path';
import { parse } from 'dotenv';
import masterConfig from '../../servers.config.mjs';

/* global __SAYEON_ROOT__, __SAYEON_ENV__ — 묶을 때 넣는 값 (묶음 폴더 경로 · 환경 이름) */

export const PLUGIN = true;
export const SERVER_ROOT = __SAYEON_ROOT__;
export const readWebConfigSettings = () => null;
export const webConfigSettings = null;

let file = {};
try {
  file = parse(fs.readFileSync(path.join(SERVER_ROOT, '.env')));
} catch {
  // .env 가 없으면 기본값 — 시작할 때 DB 계정이 없다고 알려 준다
}
/** 설정값 — 묶음 폴더의 .env (환경은 묶을 때 정한 값으로 고정) */
export const env = { ...file, SAYEON_ENV: __SAYEON_ENV__ };

export const MASTER_FILE = '(묶음에 들어 있음)';
export const master = masterConfig;
