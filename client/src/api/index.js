/**
 * API 진입점 — 운영 모드(src/config.js)에 따라 고른다
 *  - test → 브라우저 localStorage의 가짜 DB (서버 없이 전 기능 테스트)
 *  - open → Node.js REST API (/api/*)
 * 두 구현은 같은 함수 시그니처를 가진다. 화면 코드는 `api`만 import 한다.
 * 업무 규칙은 core/service.js 하나 — test 모드는 브라우저에서, 운영은 server/ 가 같은 파일을 실행한다.
 * VITE_INCLUDE_MOCK=false 로 빌드하면 test 모드 코드와 테스트 계정이 번들에서 빠진다.
 */
import { isTestMode } from '@/config';

export const isMock = isTestMode;

// VITE_INCLUDE_MOCK=false 빌드에서는 이 분기가 상수 false가 되어 mock 청크가 만들어지지 않는다
const impl =
  import.meta.env.VITE_INCLUDE_MOCK !== 'false' && isTestMode ? await import('./mock/index.js') : await import('./http.js');

export const api = impl.api;
export { ApiError } from './errors.js';
