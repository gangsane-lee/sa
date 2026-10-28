/**
 * 운영 모드 입구 — 사내 인사정보 URL 을 불러 임직원인지 확인한다 (라우터가 화면을 열 때 부른다)
 *
 *  1) 사내 인사정보 URL 호출 (설정: servers.config.mjs 의 sso.employeeApi → sayeon.config.js)
 *  2) 정상 회신이면 응답을 localStorage(EMPLOYEE_STORAGE_KEY)에 저장
 *  3) 응답을 읽어(utils/employeeInfo.js) 사번·재직 여부 확인
 *  → 결과 { ok, code, message, user, profile } — ok 이면 사용자 정보(user)를 API 서버에 넘겨 세션을 만든다
 *
 * 사내 인사정보 서버가 다른 주소라면 그 서버가 이 화면 주소에 CORS 를 열어 줘야 브라우저가 응답을 읽을 수 있다.
 */
import { EMPLOYEE_API as E, EMPLOYEE_STORAGE_KEY } from '@/config';
import { readEmployee } from '@shared/utils/employeeInfo';

const fail = (code, message) => ({ ok: false, code, message, user: null, profile: null });

const lsGet = (k) => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
/** 주소창 값 — 안내 화면(/login?redirect=/원래주소?…)에서 다시 확인할 때는 원래 주소의 값을 본다 */
const queryGet = (k) => {
  try {
    const q = new URLSearchParams(window.location.search);
    if (q.has(k)) return q.get(k);
    const back = q.get('redirect');
    return back ? new URL(back, window.location.origin).searchParams.get(k) : null;
  } catch {
    return null;
  }
};

/** 본문·주소의 {ls:키} {query:이름} 채우기 */
const fillText = (v, enc) =>
  v.replace(/\{(ls|query):([^}]+)\}/g, (_, kind, key) => {
    const got = (kind === 'ls' ? lsGet(key) : queryGet(key)) ?? '';
    return enc ? encodeURIComponent(got) : got;
  });
const fillDeep = (v) =>
  Array.isArray(v) ? v.map(fillDeep)
    : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, fillDeep(x)]))
      : typeof v === 'string' ? fillText(v, false) : v;

/** 저장해 둔 인사정보 지우기 (로그아웃) */
export function clearEmployee() {
  try {
    localStorage.removeItem(EMPLOYEE_STORAGE_KEY);
  } catch {
    /* noop */
  }
}

export async function fetchEmployee() {
  if (!E.url) return fail('SSO_NOT_CONFIGURED', '사내 인사정보 주소가 아직 정해지지 않았어요.');

  let res;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), E.timeoutMs);
  try {
    const post = E.method === 'POST';
    res = await fetch(fillText(E.url, true), {
      method: E.method,
      credentials: E.withCredentials ? 'include' : 'same-origin',
      headers: { Accept: 'application/json', ...(post && { 'Content-Type': 'application/json' }), ...E.headers },
      body: post ? JSON.stringify(fillDeep(E.body ?? {})) : undefined,
      signal: ctrl.signal,
    });
  } catch {
    return fail('SSO_UNAVAILABLE', '사내 인사정보 서버에 연결하지 못했어요.');
  } finally {
    clearTimeout(timer);
  }
  if (res.status >= 500) return fail('SSO_UNAVAILABLE', `사내 인사정보 서버 오류 (${res.status})`);
  if (!res.ok) return fail('SSO_FAILED', `사내 인사정보에서 확인되지 않았어요 (${res.status})`);

  const text = await res.text().catch(() => '');
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    return fail('SSO_FAILED', '사내 인사정보 응답을 읽지 못했어요.');
  }
  try {
    localStorage.setItem(EMPLOYEE_STORAGE_KEY, text);
  } catch {
    /* 저장이 막힌 브라우저여도 확인은 계속한다 */
  }

  const { user, profile } = readEmployee(json, E.resultPath);
  if (!profile) return fail('SSO_FAILED', '사내 인사정보에서 사번을 찾지 못했어요.');
  if (!profile.active) return { ...fail('NOT_ACTIVE_EMPLOYEE', '재직 중으로 확인되지 않았어요.'), profile };
  return { ok: true, code: null, message: '', user, profile };
}
