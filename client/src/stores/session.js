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
  /** 운영: 마지막 SSO 확인이 안 된 이유 { code, message } — 안내 화면(SsoGateView)이 보여준다 */
  ssoError: null,
  get isAdmin() {
    return this.adminExpiresAt > Date.now();
  },
});

/** 주소창의 값 — SSO 로그인 페이지에서 돌아올 때 붙은 ticket 등을 서버에 넘긴다 */
const pageQuery = () => {
  try {
    return Object.fromEntries(new URLSearchParams(window.location.search));
  } catch {
    return {};
  }
};

/**
 * 운영(open): 사내 SSO로 임직원을 확인한다. 인사정보가 오면 바로 들어오고, 아니면 ssoError 에 이유를 남긴다
 * @returns {Promise<boolean>} 확인됐는지
 */
export async function ssoLogin() {
  try {
    const r = await api.auth.sso({ query: pageQuery() });
    session.user = r.user;
    session.adminExpiresAt = 0;
    session.ssoError = null;
    return true;
  } catch (e) {
    session.user = null;
    session.ssoError = { code: e.code ?? (e.status === 0 ? 'NETWORK' : 'SSO_FAILED'), message: e.message };
    return false;
  }
}

export async function restoreSession() {
  if (session.restored) return;
  try {
    const r = await api.auth.me();
    session.user = r.user;
    session.adminExpiresAt = r.adminExpiresAt ?? 0;
  } catch {
    session.user = null;
    session.adminExpiresAt = 0;
    // 정식 운영: 로그인 화면 없이 사내 SSO로만 들어온다. 확인되면 바로 홈, 아니면 안내 화면
    // test 모드: 테스트 계정 로그인 화면
    if (!isTestMode) await ssoLogin();
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

/** test 모드: 테스트 계정 로그인 (운영은 ssoLogin) */
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
    // 운영: 로그아웃한 뒤에는 SSO로 바로 다시 들어가지 않고 안내 화면에서 '다시 들어가기'를 누르게 한다
    session.ssoError = isTestMode ? null : { code: 'LOGGED_OUT', message: '로그아웃했어요.' };
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
