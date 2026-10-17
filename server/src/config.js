/**
 * 서버 설정
 *  - 서버 주소·포트·DB 서버/이름·관리자 주소·SSO 방식 → 저장소 맨 위의 servers.config.mjs (마스터)
 *  - 비밀번호·키·어느 환경으로 돌지(SAYEON_ENV)      → server/.env (설명: .env.example)
 * 이 파일은 둘을 읽어 합치기만 한다.
 */
import { config as loadEnv } from 'dotenv';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import crypto from 'node:crypto';
import { loadTopology, isIPv4 } from '../../tools/topology.mjs';

export const SERVER_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
loadEnv({ path: path.join(SERVER_ROOT, '.env'), quiet: true });

const env = process.env;
const str = (v, d = '') => (v === undefined || v === '' ? d : String(v).trim());
const num = (v, d) => (Number.isFinite(Number(v)) && String(v).trim() !== '' ? Number(v) : d);
const bool = (v, d) => (v === undefined || v === '' ? d : ['1', 'true', 'yes', 'y', 'on'].includes(String(v).trim().toLowerCase()));

/** servers.config.mjs 에서 이 서버의 환경 (SAYEON_ENV = production | development) */
export const topology = loadTopology(str(env.SAYEON_ENV, 'production'));
const T = topology;
const sessionSecret = str(env.SESSION_SECRET);

export const config = {
  envName: T.envName,

  // ── 서버 (servers.config.mjs 의 api) ──
  host: '0.0.0.0',
  port: T.api.port,
  /** 사용자가 접속하는 주소 = Web 서버 */
  publicUrl: T.publicUrl,
  /** Web 서버(IIS) IP — 이 IP 에서 온 요청만 사용자 IP(X-Forwarded-For)와 로그인 헤더를 믿는다 */
  trustedProxies: [T.web.host].filter(isIPv4),
  /** (선택) API 서버가 화면도 직접 내보낼 때만 — 보통은 Web 서버(IIS)가 화면을 내보낸다 */
  clientDist: str(env.CLIENT_DIST) ? path.resolve(SERVER_ROOT, env.CLIENT_DIST) : null,

  // ── 화면 운영 (servers.config.mjs) ──
  serviceMode: T.serviceMode,
  adminPath: T.adminPath,

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
    server: T.db.host,
    port: T.db.port,
    database: T.db.name,
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

  // ── 사내 로그인 (servers.config.mjs 의 sso — src/sso.js 가 사용) ──
  sso: {
    /** iis: Web 서버 IIS 의 Windows 인증 → AD → 사내 인사 API · url: SSO 주소 한 줄 · off */
    mode: ['iis', 'url'].includes(T.sso.mode) ? T.sso.mode : 'off',
    domain: String(T.sso.domain ?? '').toUpperCase(),
    headerName: String(T.sso.header ?? 'x-sayeon-user').toLowerCase(),
    adLookup: T.sso.adLookup !== false,
    adPath: str(T.sso.adPath),
    hrApi: {
      url: str(T.sso.hrApi.url),
      method: String(T.sso.hrApi.method ?? 'POST').toUpperCase() === 'GET' ? 'GET' : 'POST',
      body: T.sso.hrApi.body ?? {},
    },
    /** 사내 인사 API · SSO API 인증 키 (비밀값이라 .env) */
    apiKey: str(env.SSO_API_KEY),
    apiKeyHeader: str(T.sso.hrApi.apiKeyHeader, 'x-api-key'),
    timeoutMs: num(T.sso.hrApi.timeoutMs, 5000),
    // url 방식일 때 (servers.config.mjs 의 sso.url · sso.loginPage)
    url: str(T.sso.url),
    loginPage: str(T.sso.loginPage),
    resultPath: str(T.sso.resultPath),
    /** 관리자 블랙리스트 등록용 임직원 검색 (선택, {q}) */
    searchUrl: str(T.sso.searchUrl),
    /** 개발 환경에서만: IIS 없이 이 계정 ID 로 로그인한 것처럼 시험 (운영에서는 무시) */
    devUser: T.envName === 'development' ? str(env.DEV_SSO_USER) : '',
  },
};

/** 예전 버전에서 쓰던 .env 항목 — 지금은 쓰지 않는다 (npm run check 가 알려 준다) */
const MOVED = 'servers.config.mjs(마스터)로 옮겨졌어요';
export const RETIRED_ENV = {
  HOST: MOVED, PORT: MOVED, PUBLIC_URL: MOVED, TRUST_PROXY: MOVED, SERVICE_MODE: MOVED, ADMIN_PATH: MOVED,
  DB_HOST: MOVED, DB_PORT: MOVED, DB_NAME: MOVED,
  SSO_URL: MOVED, SSO_LOGIN_PAGE: MOVED, SSO_RESULT_PATH: MOVED, SSO_TIMEOUT_MS: MOVED, SSO_API_KEY_HEADER: MOVED,
  HR_LOOKUP_URL: MOVED, HR_SEARCH_URL: MOVED,
  SSO_HEADER: MOVED, SSO_PROXY_SECRET: 'Web 서버 IP 확인으로 바뀌었어요 (servers.config.mjs 의 web.host)', SSO_PROXY_SECRET_HEADER: MOVED,
  AUTH_LOGIN_URL: '운영은 사내 SSO로만 들어와요. ID/비밀번호 로그인은 없어졌어요',
  SSO_TOKEN_COOKIE: '쓰지 않아요', SSO_VERIFY_URL: '쓰지 않아요', SSO_MODE: MOVED,
};
