/**
 * 로그인 사용자와 관리자 모드 상태.
 * 실제 권한 판단은 서버가 하고, 여기 값은 화면 전환용 사본이다.
 */
import { reactive } from 'vue';
import { api } from '@/api';
import { ADMIN_IDLE_MS } from '@/constants/policy';
import { isTestMode } from '@/config';

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
    // 정식 오픈: 사내 인사정보(SSO)로 인증되면 로그인 화면 없이 바로 들어온다. 실패하면 로그인 화면으로
    if (!isTestMode && api.auth.sso) {
      try {
        const r = await api.auth.sso();
        session.user = r.user;
        session.adminExpiresAt = 0;
      } catch {
        /* SSO 미연동·실패 → 로그인 화면 */
      }
    }
  } finally {
    session.restored = true;
  }
}

/**
 * 로그인 정보 다시 받기 — 신청·철회처럼 역할(GUEST/APPLICANT)이나 신청 상태가 바뀐 뒤 부른다.
 * session.user.role · applicant.userStatus 로 화면이 관리자·신청자·미신청자를 나눈다
 */
export async function refreshUser() {
  try {
    const r = await api.auth.me();
    session.user = r.user;
    session.adminExpiresAt = r.adminExpiresAt ?? 0;
  } catch {
    /* 세션이 끝났으면 다음 화면 이동 때 로그인으로 보낸다 */
  }
}

export async function login(account, password) {
  const r = await api.auth.login(account, password);
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
    // '곧 매칭이 시작돼요' 팝업은 로그인할 때마다 1번 — 같은 탭에서 다른 계정으로 다시 들어와도 보이게 표시를 지운다
    try {
      sessionStorage.removeItem('sayeon.gathering.shown');
    } catch {
      /* noop */
    }
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

/** 안 읽은 쪽지 수 (헤더 배지) */
export const unread = reactive({ count: 0 });
export async function refreshUnread() {
  try {
    unread.count = (await api.messages.unread()) ?? 0;
  } catch {
    unread.count = 0;
  }
}

/** 신청 완료 팝업처럼 화면을 넘어가며 한 번만 보여줄 메시지 */
export const flash = reactive({ applied: null });
