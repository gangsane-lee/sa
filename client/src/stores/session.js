/**
 * 로그인 사용자와 관리자 모드 상태.
 * 실제 권한 판단은 서버가 하고, 여기 값은 화면 전환용 사본이다.
 */
import { reactive } from 'vue';
import { api } from '@/api';
import { ADMIN_IDLE_MS } from '@/constants/policy';

export const session = reactive({
  user: null,
  adminExpiresAt: 0,
  restored: false,
  get isAdmin() {
    return this.adminExpiresAt > Date.now();
  },
});

export async function restoreSession() {
  if (session.restored) return;
  try {
    const r = await api.auth.me();
    session.user = r.user;
    session.adminExpiresAt = r.adminExpiresAt ?? 0;
  } catch {
    session.user = null;
    session.adminExpiresAt = 0;
  } finally {
    session.restored = true;
  }
}

export async function login(empNo, password) {
  const r = await api.auth.login(empNo, password);
  session.user = r.user;
  session.adminExpiresAt = 0;
  session.restored = true;
}

export async function logout() {
  try {
    await api.auth.logout();
  } finally {
    session.user = null;
    session.adminExpiresAt = 0;
  }
}

export async function enterAdmin(password) {
  const r = await api.auth.enterAdmin(password);
  session.adminExpiresAt = r.adminExpiresAt;
}

export async function exitAdmin() {
  try {
    await api.auth.exitAdmin();
  } finally {
    session.adminExpiresAt = 0;
  }
}

/** 관리자 API를 호출할 때마다 자동 종료 시각을 연장한다 (서버도 같은 방식의 슬라이딩 만료) */
export const adminApi = Object.fromEntries(
  Object.entries(api.admin).map(([name, fn]) => [
    name,
    async (...args) => {
      try {
        const result = await fn(...args);
        if (session.adminExpiresAt) session.adminExpiresAt = Date.now() + ADMIN_IDLE_MS;
        return result;
      } catch (err) {
        if (err.status === 401 || err.status === 403) session.adminExpiresAt = 0;
        throw err;
      }
    },
  ]),
);

/** 신청 완료 팝업처럼 화면을 넘어가며 한 번만 보여줄 메시지 */
export const flash = reactive({ applied: null });
