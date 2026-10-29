/**
 * 설정을 어디서 읽는가 — 서버 폴더(IIS 사이트 폴더)로 돌 때
 *  1) web.config 의 <appSettings>  : 환경(SAYEON_ENV) · API 포트(API_PORT) · DB 서버(DB_HOST·DB_PORT·DB_NAME)
 *     iisnode 가 환경 변수로 넘겨 주고, 점검 명령(npm run check 등)은 이 파일이 직접 읽는다
 *  2) .env                          : 비밀번호·키 (설명: .env.example) — 서버에만 두고 복사하지 않는다
 *  3) servers.config.mjs (기준정보)  : Web 서버 주소 · 관리자 주소 · 사내 로그인 방식 — 저장소에서는 맨 위,
 *                                      배포 폴더에서는 패키지가 이 폴더에 함께 넣어 준다
 * 다른 iisnode 앱의 routes 폴더에 끼워 넣는 묶음(tools/plugin.mjs)은 이 파일 대신 runtime.plugin.js 를 쓴다.
 */
import { config as loadEnv } from 'dotenv';
import { fileURLToPath, pathToFileURL } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';

/** 다른 앱에 끼워 넣은 묶음인가 */
export const PLUGIN = false;

export const SERVER_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** web.config 의 <appSettings> 값 (없으면 null) */
export function readWebConfigSettings(file = path.join(SERVER_ROOT, 'web.config')) {
  let xml;
  try {
    xml = fs.readFileSync(file, 'utf8');
  } catch {
    return null;
  }
  const block = /<appSettings>([\s\S]*?)<\/appSettings>/i.exec(xml.replace(/<!--[\s\S]*?-->/g, ''))?.[1] ?? '';
  const unxml = (s) => s.replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
  return Object.fromEntries([...block.matchAll(/<add\s+key="([^"]+)"\s+value="([^"]*)"\s*\/>/gi)].map((m) => [m[1], unxml(m[2])]));
}
/** web.config 에서 읽은 값 — 점검 명령이 보여준다 (iisnode 로 돌 때는 이미 환경 변수에 들어와 있다) */
export const webConfigSettings = readWebConfigSettings();
for (const [k, v] of Object.entries(webConfigSettings ?? {})) if (process.env[k] === undefined) process.env[k] = v;
loadEnv({ path: path.join(SERVER_ROOT, '.env'), quiet: true });

/** 설정값 — 이 서버 프로세스의 환경 변수 */
export const env = process.env;

/** 기준정보 파일 — 이 폴더 안(배포 폴더) → 한 단계 위(저장소) 순서로 찾는다 */
export const MASTER_FILE = [path.join(SERVER_ROOT, 'servers.config.mjs'), path.join(SERVER_ROOT, '..', 'servers.config.mjs')].find((f) => fs.existsSync(f)) ?? null;
export const master = MASTER_FILE ? (await import(pathToFileURL(MASTER_FILE).href)).default : { environments: {} };
