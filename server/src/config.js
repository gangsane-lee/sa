/**
 * 서버 설정 — 어디서 읽는지는 runtime.js (서버 폴더: web.config · .env · servers.config.mjs)
 * 또는 runtime.plugin.js (다른 앱의 routes 폴더에 끼워 넣은 묶음: 묶을 때 넣은 기준정보 · 묶음 폴더의 .env)
 * web.config(또는 묶음 .env)에 있는 API 포트·DB 값이 servers.config.mjs 보다 우선한다.
 */
import path from 'node:path';
import crypto from 'node:crypto';
import { resolveTopology } from '../shared/topology.js';
import { PLUGIN, SERVER_ROOT, env, master, MASTER_FILE, webConfigSettings, readWebConfigSettings } from './runtime.js';

export { PLUGIN, SERVER_ROOT, MASTER_FILE, webConfigSettings, readWebConfigSettings };
const str = (v, d = '') => (v === undefined || v === '' ? d : String(v).trim());
const num = (v, d) => (Number.isFinite(Number(v)) && String(v).trim() !== '' ? Number(v) : d);
const bool = (v, d) => (v === undefined || v === '' ? d : ['1', 'true', 'yes', 'y', 'on'].includes(String(v).trim().toLowerCase()));

/** 이 서버의 환경 (SASYSTEM_ENV = production | development) — web.config 의 API 포트·DB 값이 기준정보보다 우선 */
export const topology = resolveTopology(master, str(env.SASYSTEM_ENV, 'production'));
const T = topology;
if (!MASTER_FILE) T.problems.push('servers.config.mjs 가 없어요 — 배포 패키지의 서버 폴더를 통째로 복사해 주세요');
if (str(env.API_PORT)) T.api = { ...T.api, port: num(env.API_PORT, T.api.port) };
if (str(env.DB_HOST)) T.db = { ...T.db, host: str(env.DB_HOST) };
if (str(env.DB_PORT)) T.db = { ...T.db, port: num(env.DB_PORT, T.db.port) };
if (str(env.DB_NAME)) T.db = { ...T.db, name: str(env.DB_NAME) };
const sessionSecret = str(env.SESSION_SECRET);

/** iisnode 로 돌고 있는가 (iisnode 가 IISNODE_VERSION 을 넣어 준다) */
export const UNDER_IISNODE = Boolean(process.env.IISNODE_VERSION);

export const config = {
  envName: T.envName,

  // ── 서버 — IIS 사이트 포트(web.config 의 API_PORT). iisnode 로 돌 때 실제 연결은 iisnode 가 넘겨 주는 PORT(파이프) ──
  host: '0.0.0.0',
  port: T.api.port,
  listen: UNDER_IISNODE ? process.env.PORT : null,
  /** 사용자가 접속하는 주소 = Web 서버 */
  publicUrl: T.publicUrl,
  /** 이 API 의 주소 (사용자 브라우저가 직접 부르는 곳 — https 면 DNS 이름) */
  apiUrl: T.apiUrl,
  /**
   * 이 API 를 부를 수 있는 화면 주소(origin) — servers.config.mjs 의 Web 서버(IP · DNS 이름) + .env 의 CORS_ORIGINS(쉼표로 여러 개)
   * 화면이 다른 서버(Web 서버)에서 열리고 브라우저가 이 API 를 직접 부르므로, 여기 없는 화면의 호출은 브라우저가 막는다
   */
  corsOrigins: [...new Set([...T.webOrigins, ...str(env.CORS_ORIGINS).split(',').map((o) => o.trim().replace(/\/+$/, '')).filter(Boolean)])],
  /**
   * 앞단 프록시 — 없음. 브라우저가 API 를 직접 부르므로 X-Forwarded-For · 로그인 헤더는 사용자가 꾸밀 수 있어 믿지 않는다
   * (예전 구조: Web 서버 ARR 이 /api 를 넘기며 붙이던 값)
   */
  trustedProxies: [],
  /** https 로 온 호출만 받는다 (servers.config.mjs 의 api.https) — iisnode 가 넘겨 주는 HTTPS 값으로 판단 (src/app.js) */
  httpsOnly: T.api.https,
  /**
   * 개발 화면(npm run dev) 테스트 사번 로그인 — 세 조건이 모두 맞을 때만 (servers.config.mjs 의 devLogin 설명)
   *  key: .env 의 DEV_LOGIN_KEY (16자 이상, 비우면 꺼짐) · allowIps: 개발 PC IP · accounts: 테스트 사번
   */
  devLogin: {
    key: str(env.DEV_LOGIN_KEY),
    allowIps: [...new Set([T.devServer.host, ...str(env.DEV_LOGIN_IPS).split(',').map((x) => x.trim())].filter(Boolean))],
    accounts: T.devLogin.accounts,
  },
  /** (선택) API 서버가 화면도 직접 내보낼 때만 — 보통은 Web 서버(IIS)가 화면을 내보낸다 */
  clientDist: str(env.CLIENT_DIST) ? path.resolve(SERVER_ROOT, env.CLIENT_DIST) : null,

  // ── 화면 운영 (servers.config.mjs) — 운영 빌드(npm run build)는 늘 정식(open) ──
  serviceMode: 'open',
  adminPath: T.adminPath,

  // ── 세션 ──
  session: {
    secret: sessionSecret || crypto.randomBytes(32).toString('hex'),
    secretMissing: !sessionSecret,
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
    /** browser: 화면이 사내 인사정보 URL 을 불러 넘긴 정보 (기본) · iis: Web 서버 Windows 인증 → AD → 인사 API · url: SSO 주소 한 줄 · off */
    mode: ['browser', 'iis', 'url', 'off'].includes(T.sso.mode) ? T.sso.mode : 'browser',
    /** browser 방식: 브라우저가 부르는 사내 인사정보 URL · 임직원 확인 URL (화면 설정 sasystem.config.js 로 내려간다) */
    employeeApi: T.sso.employeeApi ?? {},
    employeeCheck: T.sso.employeeCheck ?? {},
    domain: String(T.sso.domain ?? '').toUpperCase(),
    headerName: String(T.sso.header ?? 'x-sasystem-user').toLowerCase(),
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
  DB_HOST: 'web.config 의 appSettings 로 옮겨졌어요', DB_PORT: 'web.config 의 appSettings 로 옮겨졌어요', DB_NAME: 'web.config 의 appSettings 로 옮겨졌어요',
  SSO_URL: MOVED, SSO_LOGIN_PAGE: MOVED, SSO_RESULT_PATH: MOVED, SSO_TIMEOUT_MS: MOVED, SSO_API_KEY_HEADER: MOVED,
  HR_LOOKUP_URL: MOVED, HR_SEARCH_URL: MOVED,
  SSO_HEADER: MOVED, SSO_PROXY_SECRET: 'Web 서버 IP 확인으로 바뀌었어요 (servers.config.mjs 의 web.host)', SSO_PROXY_SECRET_HEADER: MOVED,
  COOKIE_SECURE: '쿠키를 쓰지 않아요 — 로그인 세션은 화면이 헤더(X-Sasystem-Session)로 보내요',
  AUTH_LOGIN_URL: '운영은 사내 SSO로만 들어와요. ID/비밀번호 로그인은 없어졌어요',
  SSO_TOKEN_COOKIE: '쓰지 않아요', SSO_VERIFY_URL: '쓰지 않아요', SSO_MODE: MOVED,
};
