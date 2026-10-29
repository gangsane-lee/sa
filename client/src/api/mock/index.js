/**
 * 개발 모드 API — 서버 없이 브라우저 안에서 core/service.js(실제 업무 규칙)를 돌린다.
 * 데이터: localStorage(가짜 DB, 브라우저마다 따로) · 세션: sessionStorage(탭을 닫으면 로그아웃)
 * 계정: accounts.js
 */
import { configureService, api } from '@shared/api/core/service.js';
import { createSeed } from './seed.js';
import { MOCK_PASSWORD, MOCK_ADMIN_PASSWORD } from './accounts.js';

const DB_KEY = 'sasystem.mock.db.v8'; // v8: 생년월일 → 출생연도만
const SESSION_KEY = 'sasystem.mock.session';

const memory = {};
const store = (area) => ({
  get(key) {
    try {
      return JSON.parse(window[area].getItem(key));
    } catch {
      return memory[key] ?? null;
    }
  },
  set(key, value) {
    memory[key] = value;
    try {
      window[area].setItem(key, JSON.stringify(value));
    } catch {
      /* 시크릿 모드 등 저장소를 쓸 수 없으면 메모리에만 둔다 */
    }
  },
});
const local = store('localStorage');
const sess = store('sessionStorage');

configureService({
  load: () => local.get(DB_KEY),
  initial: createSeed,
  persist: (db) => local.set(DB_KEY, db),
  session: { get: () => sess.get(SESSION_KEY), set: (s) => sess.set(SESSION_KEY, s) },
  delay: () => new Promise((r) => setTimeout(r, 150 + Math.random() * 200)),
  clientIp: () => '127.0.0.1 (test)',
  allowDev: true,
  // 가짜 사내 인증: 가짜 임직원 목록 + 공통 비밀번호 (SSO 없음)
  directory: {
    authenticate(account, password, db) {
      const key = account.toLowerCase();
      const e = db.employees.find((x) => (x.adId ?? '').toLowerCase() === key || x.empNo === key);
      if (!e || password !== MOCK_PASSWORD) return null;
      return { ...e, active: !e.retired };
    },
  },
  admin: {
    isAdmin: (emp, db) => (db.admins ?? []).includes(emp.empNo),
    verify: (password) => password === MOCK_ADMIN_PASSWORD,
  },
});

export { api };
