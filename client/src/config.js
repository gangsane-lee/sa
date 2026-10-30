/**
 * 화면 운영 모드 — 명령으로 자동으로 정해진다 (따로 바꿀 설정 없음, vite.config.js 의 define)
 *
 *  npm run dev:mock → 가짜 데이터 모드: 서버 없이 브라우저 안의 가짜 데이터(mock).
 *                     로그인 화면 없이 만능 테스트 계정으로 바로 홈. 로그아웃하면 다른 테스트 계정을 고를 수 있다
 *  npm run dev      → 개발 모드: 운영 API 서버(같은 DB — 운영 데이터)를 부른다. 테스트 사번(servers.config.mjs 의 devLogin)으로 바로 로그인
 *  npm run build    → 운영 모드: 실제 API. 화면을 열 때 사내 인사정보 URL 로 임직원인지 확인한다
 *                     (가짜 데이터·테스트 사번 코드는 빌드에 들어가지 않는다)
 */
/* global __SASYSTEM_MOCK__, __SASYSTEM_DEV_API__, __SASYSTEM_SSO_DEBUG__ — vite.config.js 가 넣는 상수 (빌드에서는 모두 false) */
const runtime = (typeof window !== 'undefined' && window.SASYSTEM_CONFIG) || {};

/** 가짜 데이터 모드 (npm run dev:mock) */
export const isMock = __SASYSTEM_MOCK__;
/** 개발 모드 — 실제 API + 테스트 사번 (npm run dev) */
export const isDevApi = __SASYSTEM_DEV_API__;
/** 개발 화면(둘 중 하나) — 맨 위 '개발 모드' 띠를 보여준다 */
export const isTestMode = isMock || isDevApi;
/** 인사 확인 디버깅 모드 (npm run dev:sso) — 운영처럼 인사정보 2단계로 들어가고, 단계마다 콘솔에 기록을 남긴다 */
export const isSsoDebug = __SASYSTEM_SSO_DEBUG__;
export const SERVICE_MODE = isTestMode ? 'test' : 'open';
/** 운영 화면에서 개발자 도구 단축키·오른쪽 클릭 막기 (servers.config.mjs 의 security.blockDevtools → sasystem.config.js) */
export const BLOCK_DEVTOOLS = !import.meta.env.DEV && runtime.security?.blockDevtools !== false;

/**
 * API 서버 주소 — 화면은 Web 서버에서 열리고, 브라우저가 API 서버를 직접 부른다.
 * 운영 빌드 때 servers.config.mjs 의 API 주소(예: https://sasystem-api.corp/sasystem)가 sasystem.config.js 로 들어온다.
 * 비어 있으면 같은 주소의 /api (API 서버가 화면도 낼 때 · npm run preview 프록시)
 */
export const API_BASE = `${typeof runtime.apiBase === 'string' ? runtime.apiBase.trim().replace(/\/+$/, '') : ''}/api`;

/**
 * 운영 모드 입구 — 사내 인사정보 URL (servers.config.mjs 의 sso.employeeApi → 빌드 때 sasystem.config.js 로 들어온다)
 *  url · method(GET|POST) · body(POST 본문, {ls:키} = localStorage 값 · {query:이름} = 주소창 값)
 *  resultPath(응답에서 사용자 정보 위치, 비우면 자동) · withCredentials(사내 SSO 쿠키를 함께 보냄)
 */
const emp = runtime.employeeApi ?? {};
export const EMPLOYEE_API = {
  url: typeof emp.url === 'string' ? emp.url.trim() : '',
  method: String(emp.method ?? 'GET').toUpperCase() === 'POST' ? 'POST' : 'GET',
  body: emp.body ?? null,
  headers: emp.headers && typeof emp.headers === 'object' ? emp.headers : {},
  resultPath: typeof emp.resultPath === 'string' ? emp.resultPath : '',
  withCredentials: emp.withCredentials !== false,
  timeoutMs: Number(emp.timeoutMs) > 0 ? Number(emp.timeoutMs) : 8000,
};
/** 받아 온 인사정보를 저장하는 localStorage 키 */
export const EMPLOYEE_STORAGE_KEY = typeof emp.storageKey === 'string' && emp.storageKey ? emp.storageKey : 'sasystem.employee';

/**
 * 2단계 임직원 확인 URL — 1단계(EMPLOYEE_API) 응답의 sabun · user_name 으로 POST (servers.config.mjs 의 sso.employeeCheck)
 *  body 의 {필드} = 1단계 응답 값 · okPath/okValues: 임직원으로 볼 응답 값 (비우면 같은 사번·재직 상태로 판단)
 */
const chk = runtime.employeeCheck ?? {};
export const EMPLOYEE_CHECK = {
  url: typeof chk.url === 'string' ? chk.url.trim() : '',
  method: String(chk.method ?? 'POST').toUpperCase() === 'GET' ? 'GET' : 'POST',
  body: chk.body ?? { sabun: '{sabun}', user_name: '{user_name}' },
  headers: chk.headers && typeof chk.headers === 'object' ? chk.headers : {},
  okPath: typeof chk.okPath === 'string' ? chk.okPath.trim() : '',
  okValues: Array.isArray(chk.okValues) ? chk.okValues.map((v) => String(v).toLowerCase()) : ['y', 'true', '1', 'ok', 'success'],
  resultPath: typeof chk.resultPath === 'string' ? chk.resultPath : '',
  withCredentials: chk.withCredentials !== false,
  timeoutMs: Number(chk.timeoutMs) > 0 ? Number(chk.timeoutMs) : 8000,
};

/**
 * 관리자 화면 주소 — 사용자 화면에는 들어가는 버튼이 없고, 이 주소로 직접 들어간다.
 * 운영 빌드 때 servers.config.mjs 의 adminPath 가 sasystem.config.js 로 들어가 여기로 온다 (기본 /changeme)
 */
const adminPath = `/${String(runtime.adminPath ?? 'changeme').replace(/^\/+|\/+$/g, '')}`;
export const ADMIN_PATH = adminPath === '/' ? '/changeme' : adminPath;

/**
 * (선택) 사내 SSO 로그인 페이지 — 임직원 확인이 안 된 사람에게 '사내 SSO 로그인' 버튼으로 보여준다.
 * servers.config.mjs 의 sso.loginPage 가 빌드 때 들어온다. {returnUrl} 자리에 지금 사緣 주소가 들어간다
 */
export const SSO_LOGIN_PAGE = typeof runtime.ssoLoginPage === 'string' ? runtime.ssoLoginPage : '';
