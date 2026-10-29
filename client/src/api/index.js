/**
 * API 진입점 — 명령에 따라 자동으로 고른다 (src/config.js)
 *  - npm run dev:mock → 브라우저 localStorage의 가짜 DB (서버 없이 전 기능 테스트)
 *  - npm run dev      → 운영 API 서버 (vite 프록시 /api — 테스트 사번 로그인)
 *  - npm run build    → 운영 API 서버 (sasystem.config.js 의 apiBase)
 * 두 구현은 같은 함수 시그니처를 가진다. 화면 코드는 `api`만 import 한다.
 * 업무 규칙은 core/service.js 하나 — 가짜 데이터 모드는 브라우저에서, 운영은 server/ 가 같은 파일을 실행한다.
 * 빌드(npm run build)에는 가짜 DB 코드와 테스트 계정이 들어가지 않는다.
 */
/* global __SASYSTEM_MOCK__ */
export { isMock } from '@/config';

// __SASYSTEM_MOCK__ 은 빌드에서 상수 false 가 되어 mock 청크가 만들어지지 않는다
const impl = __SASYSTEM_MOCK__ ? await import('./mock/index.js') : await import('./http.js');

export const api = impl.api;
export { ApiError } from '@shared/api/errors.js';
