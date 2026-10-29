/**
 * 화면 운영 모드 — 명령으로 자동으로 정해진다 (따로 바꿀 설정 없음)
 *
 *  npm run dev   → 개발 모드(test): 서버 없이 브라우저 안의 가짜 데이터(mock).
 *                  로그인 화면 없이 만능 테스트 계정으로 바로 홈. 로그아웃하면 다른 테스트 계정을 고를 수 있다
 *  npm run build → 운영 모드(open): 실제 API(/api). 화면을 열 때 사내 인사정보 URL 로 임직원인지 확인한다
 *                  (가짜 데이터·테스트 계정 코드는 빌드에 들어가지 않는다)
 */
const runtime = (typeof window !== 'undefined' && window.SAYEON_CONFIG) || {};

export const isTestMode = import.meta.env.DEV;
export const SERVICE_MODE = isTestMode ? 'test' : 'open';

/**
 * API 서버 주소 — 화면은 Web 서버에서 열리고, 브라우저가 API 서버를 직접 부른다.
 * 운영 빌드 때 servers.config.mjs 의 API 주소(예: https://sayeon-api.corp/sayeon)가 sayeon.config.js 로 들어온다.
 * 비어 있으면 같은 주소의 /api (API 서버가 화면도 낼 때 · npm run preview 프록시)
 */
export const API_BASE = `${typeof runtime.apiBase === 'string' ? runtime.apiBase.trim().replace(/\/+$/, '') : ''}/api`;

/**
 * 운영 모드 입구 — 사내 인사정보 URL (servers.config.mjs 의 sso.employeeApi → 빌드 때 sayeon.config.js 로 들어온다)
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
export const EMPLOYEE_STORAGE_KEY = typeof emp.storageKey === 'string' && emp.storageKey ? emp.storageKey : 'sayeon.employee';

/**
 * 관리자 화면 주소 — 사용자 화면에는 들어가는 버튼이 없고, 이 주소로 직접 들어간다.
 * 운영 빌드 때 servers.config.mjs 의 adminPath 가 sayeon.config.js 로 들어가 여기로 온다 (기본 /changeme)
 */
const adminPath = `/${String(runtime.adminPath ?? 'changeme').replace(/^\/+|\/+$/g, '')}`;
export const ADMIN_PATH = adminPath === '/' ? '/changeme' : adminPath;

/**
 * (선택) 사내 SSO 로그인 페이지 — 임직원 확인이 안 된 사람에게 '사내 SSO 로그인' 버튼으로 보여준다.
 * servers.config.mjs 의 sso.loginPage 가 빌드 때 들어온다. {returnUrl} 자리에 지금 사緣 주소가 들어간다
 */
export const SSO_LOGIN_PAGE = typeof runtime.ssoLoginPage === 'string' ? runtime.ssoLoginPage : '';
