/** 보안 정책 값 — 서버(.env)와 같은 값을 유지할 것 */
export const ADMIN_IDLE_MINUTES = 30; // 관리자 모드: 마지막 활동 후 자동 종료
export const ADMIN_MAX_FAILS = 5; // 관리자 비밀번호 연속 실패 허용 횟수
export const ADMIN_LOCK_MINUTES = 10; // 초과 시 잠금 시간

export const ADMIN_IDLE_MS = ADMIN_IDLE_MINUTES * 60 * 1000;
export const ADMIN_LOCK_MS = ADMIN_LOCK_MINUTES * 60 * 1000;
