/**
 * ★ 로그인한 사람의 인사정보 — 한 곳에 두고 화면 어디서든 가져다 쓴다
 *
 *   import { employee } from '@/stores/employee';
 *   employee.name · employee.team · employee.empNo · employee.division · employee.gender · employee.email · employee.adId
 *   employee.loaded  채워졌는지 / employee.raw  사내 인사정보 응답의 사용자 객체 그대로 (운영만)
 *
 *  - 운영: 화면을 열 때(router → restoreSession → auth/employee.js) 사내 인사정보로 채운다
 *  - 개발·가짜 데이터: 로그인한 테스트 계정(session.user)으로 채운다
 *  - 로그아웃하면 비운다
 *  - session.user 도 같은 값으로 빈칸을 채워 둔다 (withEmployee) — session.user.name 으로 써도 같다
 */
import { reactive } from 'vue';

const FIELDS = ['empNo', 'adId', 'name', 'gender', 'division', 'team', 'email'];
const EMPTY = { empNo: '', adId: '', name: '', gender: null, division: null, team: '', email: '', active: false };

export const employee = reactive({ ...EMPTY, loaded: false, raw: null });

const filled = (o) => Object.fromEntries(FIELDS.filter((k) => o?.[k] !== undefined && o[k] !== null && o[k] !== '').map((k) => [k, o[k]]));

/**
 * 인사정보 채우기
 * @param {object} profile 사번·이름 등 (auth/employee.js 의 profile 또는 API 서버의 user)
 * @param {object} [raw] 사내 인사정보 응답의 사용자 객체
 */
export function setEmployee(profile, raw = null) {
  const p = filled(profile);
  Object.assign(employee, EMPTY, p, { active: profile?.active !== false, loaded: Boolean(p.empNo), raw });
}

/** 같은 사번이면 빈 항목만 더 채운다 (운영: 사내 인사정보 → API 서버가 저장한 값 순) */
export function mergeEmployee(user) {
  if (!user?.empNo) return;
  if (!employee.loaded || employee.empNo !== user.empNo) return setEmployee(user, employee.empNo === user.empNo ? employee.raw : null);
  for (const [k, v] of Object.entries(filled(user))) if (!employee[k]) employee[k] = v;
}

export function clearEmployeeInfo() {
  Object.assign(employee, EMPTY, { loaded: false, raw: null });
}

/** API 서버가 준 user 의 빈 항목(이름·팀 등)을 인사정보로 채운다 — 같은 사번일 때만 */
export function withEmployee(user) {
  if (!user || !employee.loaded || employee.empNo !== user.empNo) return user;
  const out = { ...user };
  for (const k of FIELDS) if ((out[k] === undefined || out[k] === null || out[k] === '') && employee[k]) out[k] = employee[k];
  return out;
}
