/**
 * API 진입점 — 명령에 따라 자동으로 고른다 (src/config.js)
 *  - npm run dev   → 브라우저 localStorage의 가짜 DB (서버 없이 전 기능 테스트)
 *  - npm run build → Node.js REST API (/api/*)
 * 두 구현은 같은 함수 시그니처를 가진다. 화면 코드는 `api`만 import 한다.
 * 업무 규칙은 core/service.js 하나 — 개발 모드는 브라우저에서, 운영은 server/ 가 같은 파일을 실행한다.
 * 빌드(npm run build)에는 가짜 DB 코드와 테스트 계정이 들어가지 않는다.
 */
import { isTestMode } from '@/config';

export const isMock = isTestMode;

// 빌드에서는 import.meta.env.DEV 가 상수 false 가 되어 mock 청크가 만들어지지 않는다
const impl = import.meta.env.DEV ? await import('./mock/index.js') : await import('./http.js');

export const api = impl.api;
export { ApiError } from '@shared/api/errors.js';
