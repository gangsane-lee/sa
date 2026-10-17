/**
 * 서비스 운영 모드 — 빌드와 상관없이 배포 후에도 바꿀 수 있다.
 *
 *  test : 테스트 운영. 서버 없이 브라우저 안의 가짜 DB(mock)로 모든 기능을 써 볼 수 있다.
 *         화면 위에 '테스트 운영 중' 띠가 뜨고, 테스트 계정 채우기 버튼이 보인다.
 *         데이터는 각 사용자 브라우저(localStorage)에만 저장된다 — 실제 개인정보를 넣지 말 것.
 *  open : 정식 오픈. 실제 Node.js API(/api)를 부른다.
 *
 * 결정 순서: 배포 폴더의 /sayeon.config.js (window.SAYEON_CONFIG.mode) → 빌드 환경 변수 VITE_SERVICE_MODE → 'open'
 *  → 오픈할 때는 dist/sayeon.config.js 의 mode 를 'open' 으로 바꾸고 새로고침하면 끝 (다시 빌드할 필요 없음)
 *
 * VITE_INCLUDE_MOCK=false 로 빌드하면 mock 코드·테스트 계정이 번들에서 아예 빠진다 (정식 오픈 후 권장).
 */
const runtime = (typeof window !== 'undefined' && window.SAYEON_CONFIG) || {};
const requested = runtime.mode ?? import.meta.env.VITE_SERVICE_MODE ?? 'open';

export const MOCK_INCLUDED = import.meta.env.VITE_INCLUDE_MOCK !== 'false';
export const SERVICE_MODE = requested === 'test' && MOCK_INCLUDED ? 'test' : 'open';
export const isTestMode = SERVICE_MODE === 'test';

/**
 * 관리자 화면 주소 — 사용자 화면에는 들어가는 버튼이 없고, 이 주소로 직접 들어간다.
 * 운영 빌드 때 servers.config.mjs 의 adminPath 가 sayeon.config.js 로 들어가 여기로 온다 (기본 /changeme)
 */
const adminPath = `/${String(runtime.adminPath ?? 'changeme').replace(/^\/+|\/+$/g, '')}`;
export const ADMIN_PATH = adminPath === '/' ? '/changeme' : adminPath;

/**
 * (선택) 사내 SSO 로그인 페이지 — 운영에서 SSO 확인이 안 된 사람에게 '사내 SSO 로그인' 버튼으로 보여준다.
 * server/.env 의 SSO_LOGIN_PAGE 가 내려온다. {returnUrl} 자리에 지금 사緣 주소가 들어간다
 */
export const SSO_LOGIN_PAGE = typeof runtime.ssoLoginPage === 'string' ? runtime.ssoLoginPage : '';
