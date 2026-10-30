/**
 * 운영 모드 입구 — 사내 인사정보로 임직원인지 확인한다 (라우터가 화면을 열 때 부른다)
 *
 *  1) router/index.js 의 beforeEach 가 localStorage 에 저장한 sabun · user_name (stores/employee.js 의 readLogin)
 *     없으면 사내 인사 데이터 URL 호출 (servers.config.mjs 의 sso.employeeApi → sasystem.config.js)
 *     정상 회신이면 응답을 localStorage(EMPLOYEE_STORAGE_KEY)에 저장하고 sabun · user_name 등을 읽는다
 *  2) 임직원 확인 URL 에 1)의 sabun · user_name 을 POST (sso.employeeCheck — 비어 있으면 건너뛴다)
 *     응답으로 임직원인지 판단한다 (okPath 값 또는 같은 사번 · 재직 상태)
 *  → 결과 { ok, code, message, user, profile } — ok 이면 사용자 정보(user)를 API 서버에 넘겨 세션을 만든다
 *
 * 두 서버가 다른 주소라면 그 서버들이 이 화면 주소에 CORS 를 열어 줘야 브라우저가 응답을 읽을 수 있다.
 */
/* global __SASYSTEM_SSO_DEBUG__ */
import { EMPLOYEE_API as E, EMPLOYEE_CHECK as C, EMPLOYEE_STORAGE_KEY } from '@/config';
import { readEmployee, mapProfile, withProfile } from '@shared/utils/employeeInfo';
import { readLogin, clearLogin } from '@/stores/employee';

/**
 * 단계 기록 — npm run dev:sso 에서만 F12 → Console 에 '[인사 확인] …' 묶음으로 남긴다
 * (운영 빌드에서는 상수 false 라 코드째 빠진다)
 */
export function trace(step, ...data) {
  if (!__SASYSTEM_SSO_DEBUG__) return;
  console.groupCollapsed(`%c[인사 확인] ${step}`, 'color:#1428a0;font-weight:700');
  for (const d of data) console.log(d);
  console.groupEnd();
}

const fail = (code, message) => {
  trace(`✖ 실패 ${code}`, message);
  return { ok: false, code, message, user: null, profile: null };
};

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

/** 저장해 둔 인사정보 지우기 (로그아웃) — router 가 저장한 sabun · user_name 도 지워 다음에 로그인 서비스로 가게 한다 */
export function clearEmployee() {
  clearLogin();
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
async function callJson(cfg, user = null, step = '') {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), cfg.timeoutMs);
  const post = cfg.method === 'POST';
  const url = fillText(cfg.url, true, user);
  const body = post ? JSON.stringify(fillDeep(cfg.body ?? {}, user)) : undefined;
  trace(`${step} 요청 ${cfg.method} ${url}`, { url, method: cfg.method, body: body ? JSON.parse(body) : null, withCredentials: cfg.withCredentials, timeoutMs: cfg.timeoutMs });
  try {
    const res = await fetch(url, {
      method: cfg.method,
      credentials: cfg.withCredentials ? 'include' : 'same-origin',
      headers: { Accept: 'application/json', ...(post && { 'Content-Type': 'application/json' }), ...cfg.headers },
      body,
      signal: ctrl.signal,
    });
    const text = await res.text().catch(() => '');
    let json;
    try {
      json = JSON.parse(text);
    } catch {
      json = undefined;
    }
    trace(`${step} 응답 ${res.status}`, json ?? text.slice(0, 1000));
    return { status: res.status, ok: res.ok, text, json };
  } catch (e) {
    trace(`${step} 호출 실패 (연결 · CORS · CSP · 인증서 · 시간 초과)`, e, '바로 위 빨간 오류 문구를 확인하세요');
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** 1단계 — router 가 localStorage 에 저장한 sabun · user_name, 없으면 사내 인사 데이터 URL → { json } 또는 { error } */
async function stepOne() {
  const login = readLogin();
  if (login) {
    trace('1단계 — router 가 저장한 localStorage sabun · user_name 사용', login);
    return { json: login, resultPath: '' };
  }
  if (!E.url) return { error: fail('SSO_NOT_CONFIGURED', '로그인 정보(sabun · user_name)가 없고, 사내 인사정보 주소도 정해지지 않았어요.') };
  const r1 = await callJson(E, null, '1단계 인사 데이터');
  if (!r1) return { error: fail('SSO_UNAVAILABLE', '사내 인사정보 서버에 연결하지 못했어요.') };
  if (r1.status >= 500) return { error: fail('SSO_UNAVAILABLE', `사내 인사정보 서버 오류 (${r1.status})`) };
  if (!r1.ok) return { error: fail('SSO_FAILED', `사내 인사정보에서 확인되지 않았어요 (${r1.status})`) };
  if (r1.json === undefined) return { error: fail('SSO_FAILED', '사내 인사정보 응답을 읽지 못했어요.') };
  lsSet(EMPLOYEE_STORAGE_KEY, r1.text);
  return { json: r1.json, resultPath: E.resultPath };
}

export async function fetchEmployee() {
  // 1) router 가 저장한 sabun · user_name 또는 사내 인사 데이터
  trace('0 설정', { 로그인값: readLogin() ?? '(없음 — 인사 데이터 URL 호출)', 인사데이터: E, 임직원확인: C.url ? C : '(없음 — 1단계만으로 확인)' });
  const r1 = await stepOne();
  if (r1.error) return r1.error;

  const first = readEmployee(r1.json, r1.resultPath);
  trace('1단계 해석 — 사번이 든 객체 · 읽은 값', { 찾은위치: first.path || '(맨 바깥)', 사용자정보: first.user, 읽은값: first.profile });
  if (!first.profile) return fail('SSO_FAILED', '사내 인사정보에서 사번을 찾지 못했어요.');
  if (!first.profile.active) return { ...fail('NOT_ACTIVE_EMPLOYEE', '재직 중으로 확인되지 않았어요.'), profile: first.profile };
  if (!C.url) {
    const user = withProfile(first.user, first.profile);
    trace('✔ 인사 확인 통과 (2단계 없음) — API 서버로 넘길 정보', user);
    return { ok: true, code: null, message: '', user, profile: first.profile };
  }

  // 2) 임직원 확인 — 1)의 sabun · user_name 으로 POST
  const r2 = await callJson(C, first.user, '2단계 임직원 확인');
  if (!r2) return fail('SSO_UNAVAILABLE', '임직원 확인 서버에 연결하지 못했어요.');
  if (r2.status >= 500) return fail('SSO_UNAVAILABLE', `임직원 확인 서버 오류 (${r2.status})`);
  if (!r2.ok || r2.json === undefined) return fail('NOT_EMPLOYEE', `임직원으로 확인되지 않았어요${r2.ok ? '' : ` (${r2.status})`}`);
  lsSet(`${EMPLOYEE_STORAGE_KEY}.check`, r2.text);

  const second = readEmployee(r2.json, C.resultPath);
  let ok;
  if (C.okPath) ok = C.okValues.includes(String(valueAt(r2.json, C.okPath) ?? '').toLowerCase());
  else ok = Boolean(second.profile && second.profile.empNo === first.profile.empNo && second.profile.active);
  trace('2단계 판단', C.okPath
    ? { okPath: C.okPath, 응답값: valueAt(r2.json, C.okPath), okValues: C.okValues, 임직원: ok }
    : { 기준: '같은 사번 · 재직 상태', 응답사용자: second.profile, 임직원: ok });
  if (!ok) return { ...fail('NOT_EMPLOYEE', '임직원으로 확인되지 않았어요.'), profile: first.profile };

  // 2)에 같은 사람 정보(이름·성별·사업부 등)가 더 있으면 합친다
  //  같은 사번 객체면 통째로, 사번 없이 정보만 회신하면 빈 항목을 2) → 1) 응답 순으로 찾아 채운다
  const sameUser = second.profile && second.profile.empNo === first.profile.empNo;
  const merged = sameUser ? { ...first.user, ...second.user } : first.user;
  const profile = mapProfile(merged, [r2.json, r1.json]) ?? first.profile;
  const user = withProfile(merged, profile);
  trace('✔ 인사 확인 통과 — 읽은 값 · API 서버로 넘길 정보', { 읽은값: profile, 넘길정보: user });
  return { ok: true, code: null, message: '', user, profile };
}
