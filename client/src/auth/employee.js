/**
 * 운영 모드 입구 — 사내 인사정보로 임직원인지 확인한다 (라우터가 화면을 열 때 부른다)
 *
 *  1) 사내 인사 데이터 URL 호출 (servers.config.mjs 의 sso.employeeApi → sayeon.config.js)
 *     정상 회신이면 응답을 localStorage(EMPLOYEE_STORAGE_KEY)에 저장하고 sabun · user_name 등을 읽는다
 *  2) 임직원 확인 URL 에 1)의 sabun · user_name 을 POST (sso.employeeCheck — 비어 있으면 건너뛴다)
 *     응답으로 임직원인지 판단한다 (okPath 값 또는 같은 사번 · 재직 상태)
 *  → 결과 { ok, code, message, user, profile } — ok 이면 사용자 정보(user)를 API 서버에 넘겨 세션을 만든다
 *
 * 두 서버가 다른 주소라면 그 서버들이 이 화면 주소에 CORS 를 열어 줘야 브라우저가 응답을 읽을 수 있다.
 */
import { EMPLOYEE_API as E, EMPLOYEE_CHECK as C, EMPLOYEE_STORAGE_KEY } from '@/config';
import { readEmployee } from '@shared/utils/employeeInfo';

const fail = (code, message) => ({ ok: false, code, message, user: null, profile: null });

const lsGet = (k) => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const lsSet = (k, v) => {
  try {
    localStorage.setItem(k, v);
  } catch {
    /* 저장이 막힌 브라우저여도 확인은 계속한다 */
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
/** 1단계 응답의 필드 값 — 이름이 정확히 같은 것, 없으면 대소문자·_ 를 무시하고 찾는다 */
const fieldGet = (user, k) => {
  if (!user) return null;
  if (user[k] !== undefined && user[k] !== null) return String(user[k]);
  const norm = (s) => String(s).toLowerCase().replace(/[_\-\s]/g, '');
  const hit = Object.keys(user).find((x) => norm(x) === norm(k));
  return hit && user[hit] !== null && typeof user[hit] !== 'object' ? String(user[hit]) : null;
};

/** 본문·주소의 {ls:키} {query:이름} (+ 2단계: {필드} = 1단계 응답 값) 채우기 */
const fillText = (v, enc, user = null) =>
  v.replace(/\{(?:(ls|query):)?([^{}]+)\}/g, (all, kind, key) => {
    const got = kind === 'ls' ? lsGet(key) : kind === 'query' ? queryGet(key) : user ? fieldGet(user, key) : null;
    if (!kind && !user) return all; // 1단계에서는 {필드} 를 그대로 둔다
    return enc ? encodeURIComponent(got ?? '') : (got ?? '');
  });
const fillDeep = (v, user) =>
  Array.isArray(v) ? v.map((x) => fillDeep(x, user))
    : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, fillDeep(x, user)]))
      : typeof v === 'string' ? fillText(v, false, user) : v;
const valueAt = (json, p) => p.split('.').reduce((o, k) => (o == null ? o : o[k]), json);

/** 저장해 둔 인사정보 지우기 (로그아웃) */
export function clearEmployee() {
  try {
    localStorage.removeItem(EMPLOYEE_STORAGE_KEY);
    localStorage.removeItem(`${EMPLOYEE_STORAGE_KEY}.check`);
  } catch {
    /* noop */
  }
}

/**
 * URL 하나 호출 → { status, text, json } (연결 실패면 null)
 * @param {{ url, method, headers, body, withCredentials, timeoutMs }} cfg
 */
async function callJson(cfg, user = null) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), cfg.timeoutMs);
  try {
    const post = cfg.method === 'POST';
    const res = await fetch(fillText(cfg.url, true, user), {
      method: cfg.method,
      credentials: cfg.withCredentials ? 'include' : 'same-origin',
      headers: { Accept: 'application/json', ...(post && { 'Content-Type': 'application/json' }), ...cfg.headers },
      body: post ? JSON.stringify(fillDeep(cfg.body ?? {}, user)) : undefined,
      signal: ctrl.signal,
    });
    const text = await res.text().catch(() => '');
    let json;
    try {
      json = JSON.parse(text);
    } catch {
      json = undefined;
    }
    return { status: res.status, ok: res.ok, text, json };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchEmployee() {
  if (!E.url) return fail('SSO_NOT_CONFIGURED', '사내 인사정보 주소가 아직 정해지지 않았어요.');

  // 1) 사내 인사 데이터
  const r1 = await callJson(E);
  if (!r1) return fail('SSO_UNAVAILABLE', '사내 인사정보 서버에 연결하지 못했어요.');
  if (r1.status >= 500) return fail('SSO_UNAVAILABLE', `사내 인사정보 서버 오류 (${r1.status})`);
  if (!r1.ok) return fail('SSO_FAILED', `사내 인사정보에서 확인되지 않았어요 (${r1.status})`);
  if (r1.json === undefined) return fail('SSO_FAILED', '사내 인사정보 응답을 읽지 못했어요.');
  lsSet(EMPLOYEE_STORAGE_KEY, r1.text);

  const first = readEmployee(r1.json, E.resultPath);
  if (!first.profile) return fail('SSO_FAILED', '사내 인사정보에서 사번을 찾지 못했어요.');
  if (!first.profile.active) return { ...fail('NOT_ACTIVE_EMPLOYEE', '재직 중으로 확인되지 않았어요.'), profile: first.profile };
  if (!C.url) return { ok: true, code: null, message: '', user: first.user, profile: first.profile };

  // 2) 임직원 확인 — 1)의 sabun · user_name 으로 POST
  const r2 = await callJson(C, first.user);
  if (!r2) return fail('SSO_UNAVAILABLE', '임직원 확인 서버에 연결하지 못했어요.');
  if (r2.status >= 500) return fail('SSO_UNAVAILABLE', `임직원 확인 서버 오류 (${r2.status})`);
  if (!r2.ok || r2.json === undefined) return fail('NOT_EMPLOYEE', `임직원으로 확인되지 않았어요${r2.ok ? '' : ` (${r2.status})`}`);
  lsSet(`${EMPLOYEE_STORAGE_KEY}.check`, r2.text);

  const second = readEmployee(r2.json, C.resultPath);
  let ok;
  if (C.okPath) ok = C.okValues.includes(String(valueAt(r2.json, C.okPath) ?? '').toLowerCase());
  else ok = Boolean(second.profile && second.profile.empNo === first.profile.empNo && second.profile.active);
  if (!ok) return { ...fail('NOT_EMPLOYEE', '임직원으로 확인되지 않았어요.'), profile: first.profile };

  // 2)에 같은 사람 정보(성별·사업부 등)가 더 있으면 합친다
  const sameUser = second.profile && second.profile.empNo === first.profile.empNo;
  const user = sameUser ? { ...first.user, ...second.user } : first.user;
  const { profile } = readEmployee(user, '');
  return { ok: true, code: null, message: '', user, profile: profile ?? first.profile };
}
