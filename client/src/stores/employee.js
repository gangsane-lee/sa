/**
 * ★ 로그인한 사람의 인사정보 — 한 곳에 두고 화면 어디서든 가져다 쓴다
 *
 *   import { employee } from '@/stores/employee';
 *   employee.sabun · employee.user_name · employee.team · employee.division · employee.gender · employee.email · employee.adId
 *   employee.loaded  채워졌는지 / employee.raw  받은 사용자 정보 그대로 (운영만)
 *
 *  - 운영: router/index.js 의 beforeEach 가 localStorage 에 setItem 한 sabun · user_name 을 읽는다 (readLogin)
 *          (값이 없으면 servers.config.mjs 의 sso.employeeApi URL 을 부른다 — auth/employee.js)
 *  - 개발·가짜 데이터: 로그인한 테스트 계정(session.user)으로 채운다
 *  - 로그아웃하면 비운다
 *  - session.user 에도 sabun · user_name 이 붙는다 (withEmployee) — session.user.user_name 으로 써도 같다
 *
 * API 서버·DB 는 사번 = empNo, 이름 = name 으로 저장한다 — 화면 코드는 이 파일에서 sabun · user_name 으로 바꿔 쓴다
 */
import { reactive } from 'vue';

/** router/index.js 의 beforeEach 가 localStorage 에 setItem 하는 키 */
export const LOGIN_KEYS = { sabun: 'sabun', user_name: 'user_name' };

const FIELDS = ['sabun', 'user_name', 'adId', 'gender', 'division', 'team', 'email'];
const EMPTY = { sabun: '', user_name: '', adId: '', gender: null, division: null, team: '', email: '', active: false };

export const employee = reactive({ ...EMPTY, loaded: false, raw: null });

const blank = (v) => v === undefined || v === null || v === '';

/** API 서버 모양(empNo · name) → 화면 모양(sabun · user_name) */
const toLogin = (o) => o && { ...o, sabun: o.sabun ?? o.empNo, user_name: o.user_name ?? o.name };
const filled = (o) => Object.fromEntries(FIELDS.filter((k) => !blank(o?.[k])).map((k) => [k, o[k]]));

/** router 가 저장한 로그인 값 { sabun, user_name } — 둘 다 있을 때만 (없으면 null) */
export function readLogin() {
  try {
    const sabun = localStorage.getItem(LOGIN_KEYS.sabun)?.trim();
    const user_name = localStorage.getItem(LOGIN_KEYS.user_name)?.trim();
    return sabun && user_name ? { sabun, user_name } : null;
  } catch {
    return null;
  }
}

/** 로그아웃 — router 가 다시 로그인 서비스로 보내도록 저장한 값을 지운다 */
export function clearLogin() {
  try {
    localStorage.removeItem(LOGIN_KEYS.sabun);
    localStorage.removeItem(LOGIN_KEYS.user_name);
  } catch {
    /* noop */
  }
}

/**
 * 인사정보 채우기
 * @param {object} profile 사번·이름 등 (sabun · user_name 또는 API 서버 모양 empNo · name)
 * @param {object} [raw] 받은 사용자 정보 그대로
 */
export function setEmployee(profile, raw = null) {
  const p = filled(toLogin(profile));
  Object.assign(employee, EMPTY, p, { active: profile?.active !== false, loaded: Boolean(p.sabun), raw });
}

/** 같은 사번이면 빈 항목만 더 채운다 (운영: 로그인 값 → API 서버가 저장한 값 순) */
export function mergeEmployee(user) {
  const u = toLogin(user);
  if (!u?.sabun) return;
  if (!employee.loaded || employee.sabun !== u.sabun) return setEmployee(u);
  for (const [k, v] of Object.entries(filled(u))) if (blank(employee[k])) employee[k] = v;
}

export function clearEmployeeInfo() {
  Object.assign(employee, EMPTY, { loaded: false, raw: null });
}

/**
 * API 서버가 준 user → sabun · user_name 을 붙이고, 빈 항목(이름·팀 등)은 인사정보로 채운다 (같은 사번일 때만)
 * empNo · name 도 같은 값으로 맞춰 둔다 (서버와 같이 쓰는 코드 — 신청서 모델 등 — 가 그대로 읽게)
 */
export function withEmployee(user) {
  if (!user) return user;
  const out = toLogin(user);
  if (employee.loaded && employee.sabun === out.sabun) {
    for (const k of FIELDS) if (blank(out[k]) && !blank(employee[k])) out[k] = employee[k];
  }
  return { ...out, empNo: out.sabun, name: out.user_name ?? '' };
}
