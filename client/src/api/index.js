/**
 * API 진입점
 *  - VITE_API_MODE=mock   → 브라우저 localStorage의 가짜 DB (서버 없이 UI 확인용)
 *  - VITE_API_MODE=server → Node.js REST API (/api/*)
 * 두 구현은 같은 함수 시그니처를 가진다. 화면 코드는 `api`만 import 한다.
 * 운영 빌드(.env.production)는 server 모드라 mock 코드와 테스트 계정이 번들에 포함되지 않는다.
 */
export const isMock = import.meta.env.VITE_API_MODE === 'mock';

const impl = isMock ? await import('./mock/index.js') : await import('./http.js');

export const api = impl.api;
export { ApiError } from './errors.js';
