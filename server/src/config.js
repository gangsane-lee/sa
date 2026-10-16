/**
 * 서버 설정 — 값은 모두 server/.env 에서 고친다 (이 파일은 읽기만 한다).
 * .env 항목 설명은 server/.env.example 참고.
 */
import { config as loadEnv } from 'dotenv';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import crypto from 'node:crypto';

export const SERVER_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
loadEnv({ path: path.join(SERVER_ROOT, '.env'), quiet: true });

const env = process.env;
const str = (v, d = '') => (v === undefined || v === '' ? d : String(v).trim());
const num = (v, d) => (Number.isFinite(Number(v)) && String(v).trim() !== '' ? Number(v) : d);
const bool = (v, d) => (v === undefined || v === '' ? d : ['1', 'true', 'yes', 'y', 'on'].includes(String(v).trim().toLowerCase()));

const sessionSecret = str(env.SESSION_SECRET);

export const config = {
  // ── 서버 ──
  host: str(env.HOST, '0.0.0.0'),
  port: num(env.PORT, 3000),
  publicUrl: str(env.PUBLIC_URL, `http://localhost:${num(env.PORT, 3000)}`),
  /** 앞단에 IIS·Nginx 리버스 프록시가 있으면 true (접속 IP·https 판단에 필요) */
  trustProxy: bool(env.TRUST_PROXY, false),
  /** 화면 빌드 결과(client/dist) 위치 */
  clientDist: path.resolve(SERVER_ROOT, str(env.CLIENT_DIST, '../client/dist')),

  // ── 화면 운영 ──
  /** open: 실제 서버 사용 / test: 화면이 브라우저 가짜 데이터로만 동작 */
  serviceMode: str(env.SERVICE_MODE, 'open') === 'test' ? 'test' : 'open',
  /** 관리자 화면 주소 (사용자 화면에는 들어가는 버튼이 없다) */
  adminPath: `/${str(env.ADMIN_PATH, 'changeme').replace(/^\/+|\/+$/g, '') || 'changeme'}`,

  // ── 세션 ──
  session: {
    secret: sessionSecret || crypto.randomBytes(32).toString('hex'),
    secretMissing: !sessionSecret,
    /** https로 접속하면 true. http(IP 주소 접속)면 false여야 로그인이 유지된다 */
    cookieSecure: bool(env.COOKIE_SECURE, false),
    idleHours: num(env.SESSION_IDLE_HOURS, 8),
  },

  // ── 저장소 ──
  /** mssql: 운영 DB / memory: 메모리(재시작하면 사라짐 — 점검용) */
  store: str(env.STORE, 'mssql'),
  db: {
    server: str(env.DB_HOST, 'localhost'),
    port: num(env.DB_PORT, 1433),
    database: str(env.DB_NAME, 'SAYEON'),
    user: str(env.DB_USER),
    password: env.DB_PASSWORD ?? '',
    encrypt: bool(env.DB_ENCRYPT, false),
    trustServerCertificate: bool(env.DB_TRUST_CERT, true),
    /** DB·테이블이 없으면 처음 실행할 때 만든다 (CREATE DATABASE 권한 필요) */
    autoCreate: bool(env.DB_AUTO_CREATE, true),
    /** npm run db:setup 전용 관리 계정 (DB·로그인을 만들 권한). 준비가 끝나면 .env 에서 지운다 */
    adminUser: str(env.DB_ADMIN_USER),
    adminPassword: env.DB_ADMIN_PASSWORD ?? '',
  },
  /** 이름·메일 암호화 키 (base64 32바이트). 비우면 평문 저장 — 운영에서는 반드시 채운다 */
  dataKey: str(env.DATA_KEY),

  // ── 사내 SSO / AD (src/sso.js 가 사용) ──
  sso: {
    /** header | api | off */
    mode: str(env.SSO_MODE, 'off'),
    headerName: str(env.SSO_HEADER, 'x-sso-user').toLowerCase(),
    /** header 모드: 앞단(프록시)만 아는 비밀값. 이 값이 함께 와야 헤더의 사용자 ID를 믿는다 */
    proxySecret: str(env.SSO_PROXY_SECRET),
    proxySecretHeader: str(env.SSO_PROXY_SECRET_HEADER, 'x-sso-secret').toLowerCase(),
    tokenCookie: str(env.SSO_TOKEN_COOKIE),
    verifyUrl: str(env.SSO_VERIFY_URL),
    loginUrl: str(env.AUTH_LOGIN_URL),
    lookupUrl: str(env.HR_LOOKUP_URL),
    searchUrl: str(env.HR_SEARCH_URL),
    apiKey: str(env.SSO_API_KEY),
    apiKeyHeader: str(env.SSO_API_KEY_HEADER, 'x-api-key'),
    resultPath: str(env.SSO_RESULT_PATH),
    timeoutMs: num(env.SSO_TIMEOUT_MS, 5000),
  },
};
