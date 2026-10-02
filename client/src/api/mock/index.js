/**
 * mock API — 서버 없이 UI를 확인하기 위한 가짜 백엔드.
 * http.js와 같은 함수 시그니처·응답 형태·오류 코드를 따른다. (서버 구현 시 동작 명세 역할)
 * 데이터: localStorage(가짜 DB), 세션: sessionStorage(탭을 닫으면 로그아웃)
 */
import { ApiError } from '../errors.js';
import { createSeed, MOCK_PASSWORD, MOCK_ADMIN_PASSWORD } from './seed.js';
import { scoreCandidates } from './matching.js';
import { validateApplication, ageOf } from '@/utils/applicationRules';
import { FIELD_LABELS } from '@/utils/applicationModel';
import { maskPhone, maskEmail, maskName } from '@/utils/format';
import { APPLY_STATUS, APPLY_STATUS_MAP, MATCH_STATUS, ACTIVE_MATCH_STATUS, DIVISIONS, textOf } from '@/constants/codes';
import { ADMIN_IDLE_MS, ADMIN_LOCK_MS, ADMIN_MAX_FAILS, ADMIN_LOCK_MINUTES } from '@/constants/policy';

const DB_KEY = 'sayeon.mock.db.v2';
const SESSION_KEY = 'sayeon.mock.session';
const DAY = 86400000;

/** 신청자가 저장할 수 있는 항목 화이트리스트 (그 외 키는 무시 — 서버도 동일하게) */
const APP_FIELDS = [
  'name', 'gender', 'birthYear', 'division', 'dept', 'careerLevel', 'workSite', 'workPattern', 'phone', 'email',
  'height', 'bodyType', 'residence', 'education', 'smoking', 'drinking', 'mbti', 'religion', 'agreeSensitive',
  'hobbies', 'personality', 'intro', 'prefAgeMin', 'prefAgeMax', 'prefKeywords', 'prefSmoking', 'meetingStyle',
  'avoidScope', 'messageToManager', 'agreePrivacy', 'agreeShare',
];
const ADMIN_EDITABLE = [...APP_FIELDS.filter((f) => !f.startsWith('agree')), 'status', 'adminMemo'];

// ── 저장소 ───────────────────────────────────────────────
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

let db = local.get(DB_KEY) ?? createSeed();
const commit = () => local.set(DB_KEY, db);
commit();

const wait = () => new Promise((r) => setTimeout(r, 200 + Math.random() * 250));
const clone = (v) => structuredClone(v);
const nowIso = () => new Date().toISOString();
const pickFields = (src, keys) => Object.fromEntries(keys.filter((k) => k in src).map((k) => [k, clone(src[k])]));

// ── 세션 / 권한 ──────────────────────────────────────────
const getSession = () => sess.get(SESSION_KEY) ?? {};
const setSession = (s) => sess.set(SESSION_KEY, s);

const publicUser = (e) => ({
  empNo: e.empNo, name: e.name, gender: e.gender, division: e.division, dept: e.dept,
  careerLevel: e.careerLevel, workSite: e.workSite, email: e.email,
});

function requireUser() {
  const emp = db.employees.find((e) => e.empNo === getSession().empNo && !e.retired);
  if (!emp) throw new ApiError(401, '로그인이 필요해요.', 'UNAUTHENTICATED');
  return emp;
}

function requireAdmin() {
  const user = requireUser();
  const s = getSession();
  if (!(s.adminExpiresAt > Date.now())) {
    throw new ApiError(403, '관리자 모드가 종료됐어요. 다시 인증해 주세요.', 'ADMIN_REQUIRED');
  }
  setSession({ ...s, adminExpiresAt: Date.now() + ADMIN_IDLE_MS }); // 활동할 때마다 연장
  return user;
}

function audit(actor, action, target = '', detail = '') {
  db.auditLogs.unshift({
    id: ++db.seq.audit, at: nowIso(), actorEmpNo: actor.empNo, actorName: actor.name,
    action, target, detail, ip: '127.0.0.1 (mock)',
  });
}

const findApplicant = (id) => {
  const a = db.applicants.find((x) => x.id === Number(id));
  if (!a) throw new ApiError(404, '신청서를 찾을 수 없어요. 이미 삭제됐을 수 있어요.', 'NOT_FOUND');
  return a;
};
const tag = (a) => `#${a.id} ${maskName(a.name)}`;
const withAge = (a) => ({ ...clone(a), age: ageOf(a.birthYear) });

/** 매칭 상태에 맞춰 두 신청자의 상태를 맞춘다 */
function syncStatuses(m) {
  for (const id of [m.aId, m.bId]) {
    const a = db.applicants.find((x) => x.id === id);
    if (!a) continue;
    if (m.status === 'PROPOSED') a.status = 'MATCHING';
    else if (m.status === 'ACCEPTED' || m.status === 'MET') a.status = 'MATCHED';
    else {
      const stillActive = db.matches.some(
        (o) => o.id !== m.id && ACTIVE_MATCH_STATUS.includes(o.status) && (o.aId === id || o.bId === id),
      );
      if (!stillActive && (a.status === 'MATCHING' || a.status === 'MATCHED')) a.status = 'REVIEWING';
    }
    a.updatedAt = nowIso();
  }
}

function removeApplicant(a) {
  const related = db.matches.filter((m) => m.aId === a.id || m.bId === a.id);
  db.applicants = db.applicants.filter((x) => x.id !== a.id);
  db.matches = db.matches.filter((m) => !related.includes(m));
  for (const m of related) syncStatuses({ ...m, status: 'DECLINED' });
}

const userView = (a) => {
  const { adminMemo, ...rest } = clone(a); // 관리 메모는 본인에게도 보이지 않는다
  return rest;
};

// ── API ─────────────────────────────────────────────────
export const api = {
  auth: {
    async login(empNo, password) {
      await wait();
      const emp = db.employees.find((e) => e.empNo === String(empNo).trim());
      if (!emp || password !== MOCK_PASSWORD) {
        throw new ApiError(401, '사번 또는 비밀번호가 맞지 않아요. 다시 확인해 주세요.', 'BAD_CREDENTIALS');
      }
      if (emp.retired) throw new ApiError(403, '재직 중인 임직원만 이용할 수 있어요.', 'NOT_ACTIVE_EMPLOYEE');
      setSession({ empNo: emp.empNo });
      return { user: publicUser(emp), adminExpiresAt: 0 };
    },

    async me() {
      await wait();
      const user = requireUser();
      const s = getSession();
      return { user: publicUser(user), adminExpiresAt: s.adminExpiresAt > Date.now() ? s.adminExpiresAt : 0 };
    },

    async logout() {
      const s = getSession();
      const emp = db.employees.find((e) => e.empNo === s.empNo);
      if (emp && s.adminExpiresAt > Date.now()) {
        audit(emp, 'ADMIN_EXIT', '', '로그아웃');
        commit();
      }
      setSession({});
      return null;
    },

    async enterAdmin(password) {
      await wait();
      const user = requireUser();
      const s = getSession();
      if (s.adminLockedUntil > Date.now()) {
        const min = Math.ceil((s.adminLockedUntil - Date.now()) / 60000);
        throw new ApiError(423, `비밀번호를 여러 번 틀려 관리자 인증이 잠겼어요. ${min}분 뒤에 다시 시도해 주세요.`, 'ADMIN_LOCKED');
      }
      if (password !== MOCK_ADMIN_PASSWORD) {
        const fails = (s.adminFails ?? 0) + 1;
        audit(user, 'ADMIN_ENTER_FAIL', '', `${fails}회째 실패`);
        commit();
        if (fails >= ADMIN_MAX_FAILS) {
          setSession({ ...s, adminFails: 0, adminLockedUntil: Date.now() + ADMIN_LOCK_MS });
          throw new ApiError(423, `비밀번호를 ${ADMIN_MAX_FAILS}번 틀려 ${ADMIN_LOCK_MINUTES}분 동안 관리자 인증이 잠겼어요.`, 'ADMIN_LOCKED');
        }
        setSession({ ...s, adminFails: fails });
        throw new ApiError(401, `관리자 비밀번호가 맞지 않아요. (남은 시도 ${ADMIN_MAX_FAILS - fails}회)`, 'ADMIN_BAD_PASSWORD');
      }
      const adminExpiresAt = Date.now() + ADMIN_IDLE_MS;
      setSession({ ...s, adminFails: 0, adminExpiresAt });
      audit(user, 'ADMIN_ENTER');
      commit();
      return { adminExpiresAt };
    },

    async exitAdmin() {
      const s = getSession();
      const emp = db.employees.find((e) => e.empNo === s.empNo);
      if (emp && s.adminExpiresAt > Date.now()) {
        audit(emp, 'ADMIN_EXIT');
        commit();
      }
      setSession({ ...s, adminExpiresAt: 0 });
      return null;
    },
  },

  application: {
    async getMine() {
      await wait();
      const user = requireUser();
      const app = db.applicants.find((a) => a.empNo === user.empNo);
      return app ? userView(app) : null;
    },

    async create(data) {
      await wait();
      const user = requireUser();
      if (db.applicants.some((a) => a.empNo === user.empNo)) {
        throw new ApiError(409, '이미 신청서를 냈어요. 홈에서 신청서를 수정할 수 있어요.', 'ALREADY_APPLIED');
      }
      const fields = pickFields(data, APP_FIELDS);
      const errors = validateApplication(fields);
      if (errors.length) throw new ApiError(400, `입력값을 확인해 주세요: ${errors.join(', ')}`, 'VALIDATION');
      const t = nowIso();
      const app = {
        id: ++db.seq.applicant, empNo: user.empNo, ...fields,
        status: 'RECEIVED', adminMemo: '', agreedAt: t, createdAt: t, updatedAt: t,
      };
      db.applicants.push(app);
      commit();
      return userView(app);
    },

    async update(data) {
      await wait();
      const user = requireUser();
      const app = db.applicants.find((a) => a.empNo === user.empNo);
      if (!app) throw new ApiError(404, '신청 내역이 없어요. 홈에서 새로 신청해 주세요.', 'NOT_FOUND');
      const fields = pickFields(data, APP_FIELDS);
      const errors = validateApplication(fields);
      if (errors.length) throw new ApiError(400, `입력값을 확인해 주세요: ${errors.join(', ')}`, 'VALIDATION');
      Object.assign(app, fields, { updatedAt: nowIso() });
      if (!app.agreeSensitive) app.religion = null;
      commit();
      return userView(app);
    },

    async withdraw() {
      await wait();
      const user = requireUser();
      const app = db.applicants.find((a) => a.empNo === user.empNo);
      if (app) removeApplicant(app); // 즉시 완전 삭제 (복구 불가)
      commit();
      return null;
    },
  },

  admin: {
    async stats() {
      await wait();
      requireAdmin();
      const apps = db.applicants;
      const weekAgo = Date.now() - 7 * DAY;
      return {
        total: apps.length,
        weekNew: apps.filter((a) => Date.parse(a.createdAt) >= weekAgo).length,
        male: apps.filter((a) => a.gender === 'M').length,
        female: apps.filter((a) => a.gender === 'F').length,
        proposing: db.matches.filter((m) => m.status === 'PROPOSED').length,
        couples: db.matches.filter((m) => m.status === 'ACCEPTED' || m.status === 'MET').length,
        byStatus: APPLY_STATUS.map((s) => ({ status: s.value, text: s.text, count: apps.filter((a) => a.status === s.value).length })),
        byDivision: DIVISIONS.map((d) => ({
          division: d.text,
          male: apps.filter((a) => a.division === d.value && a.gender === 'M').length,
          female: apps.filter((a) => a.division === d.value && a.gender === 'F').length,
        })),
        recent: [...apps]
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
          .slice(0, 6)
          .map((a) => ({ id: a.id, name: maskName(a.name), gender: a.gender, age: ageOf(a.birthYear), division: a.division, status: a.status, createdAt: a.createdAt })),
      };
    },

    async listApplicants({ reveal = false } = {}) {
      await wait();
      const user = requireAdmin();
      if (reveal) {
        audit(user, 'REVEAL_PII', '신청자 목록', '연락처 전체 표시');
        commit();
      }
      return db.applicants.map((a) => ({
        id: a.id, empNo: a.empNo, name: a.name, gender: a.gender, birthYear: a.birthYear, age: ageOf(a.birthYear),
        division: a.division, dept: a.dept, careerLevel: a.careerLevel, workSite: a.workSite, workPattern: a.workPattern,
        phone: reveal ? a.phone : maskPhone(a.phone), email: reveal ? a.email : maskEmail(a.email),
        status: a.status, hasMemo: Boolean(a.adminMemo), createdAt: a.createdAt, updatedAt: a.updatedAt,
      }));
    },

    async getApplicant(id) {
      await wait();
      const user = requireAdmin();
      const a = findApplicant(id);
      audit(user, 'VIEW_APPLICANT', tag(a));
      commit();
      return withAge(a);
    },

    async updateApplicant(id, data) {
      await wait();
      const user = requireAdmin();
      const a = findApplicant(id);
      const changes = pickFields(data, ADMIN_EDITABLE);
      const merged = { ...a, ...changes };
      const errors = validateApplication(merged, { requireConsent: false });
      if (errors.length) throw new ApiError(400, `입력값을 확인해 주세요: ${errors.join(', ')}`, 'VALIDATION');
      if (changes.status && !APPLY_STATUS_MAP[changes.status]) throw new ApiError(400, '알 수 없는 상태예요.', 'VALIDATION');

      const changed = Object.keys(changes).filter((k) => JSON.stringify(changes[k]) !== JSON.stringify(a[k]));
      Object.assign(a, changes, { updatedAt: nowIso() });
      if (!a.agreeSensitive) a.religion = null;
      const labels = [...new Set(changed.map((k) => FIELD_LABELS[k] ?? k))];
      audit(user, 'UPDATE_APPLICANT', tag(a), labels.length ? `변경 항목: ${labels.join(', ')}` : '변경 없음');
      commit();
      return withAge(a);
    },

    async changeStatus(ids, status) {
      await wait();
      const user = requireAdmin();
      if (!APPLY_STATUS_MAP[status]) throw new ApiError(400, '알 수 없는 상태예요.', 'VALIDATION');
      const targets = ids.map(findApplicant);
      for (const a of targets) Object.assign(a, { status, updatedAt: nowIso() });
      audit(user, 'STATUS_CHANGE', targets.length === 1 ? tag(targets[0]) : `${targets.length}명`, `→ ${APPLY_STATUS_MAP[status].text}`);
      commit();
      return null;
    },

    async deleteApplicant(id) {
      await wait();
      const user = requireAdmin();
      const a = findApplicant(id);
      removeApplicant(a);
      audit(user, 'DELETE_APPLICANT', tag(a), '신청서와 매칭 내역 완전 삭제');
      commit();
      return null;
    },

    async getCandidates(id) {
      await wait();
      requireAdmin();
      const target = findApplicant(id);
      return scoreCandidates(target, db.applicants, db.matches).map(({ applicant: c, age, score, reasons }) => ({
        id: c.id, name: c.name, gender: c.gender, age, division: c.division, dept: c.dept,
        careerLevel: c.careerLevel, workSite: c.workSite, workPattern: c.workPattern, status: c.status, score, reasons,
      }));
    },

    async listMatches() {
      await wait();
      requireAdmin();
      const brief = (id) => {
        const a = db.applicants.find((x) => x.id === id);
        return a ? { name: a.name, age: ageOf(a.birthYear), division: a.division, gender: a.gender } : { name: '(삭제됨)' };
      };
      return db.matches.map((m) => {
        const a = brief(m.aId);
        const b = brief(m.bId);
        return {
          ...clone(m),
          aName: a.name, aAge: a.age, aDivision: a.division,
          bName: b.name, bAge: b.age, bDivision: b.division,
        };
      });
    },

    async createMatch(aId, bId, memo = '') {
      await wait();
      const user = requireAdmin();
      const a = findApplicant(aId);
      const b = findApplicant(bId);
      const busy = db.matches.find(
        (m) => ACTIVE_MATCH_STATUS.includes(m.status) && [m.aId, m.bId].some((x) => x === a.id || x === b.id),
      );
      if (busy) throw new ApiError(409, '두 분 중 한 분은 이미 진행 중인 매칭이 있어요.', 'MATCH_BUSY');
      const score = scoreCandidates(a, db.applicants, db.matches).find((c) => c.applicant.id === b.id)?.score ?? 0;
      const t = nowIso();
      const m = { id: ++db.seq.match, aId: a.id, bId: b.id, score, status: 'PROPOSED', memo, createdBy: user.name, createdAt: t, updatedAt: t };
      db.matches.push(m);
      syncStatuses(m);
      audit(user, 'MATCH_CREATE', `${tag(a)} ↔ ${tag(b)}`, `추천 점수 ${score}`);
      commit();
      return clone(m);
    },

    async updateMatch(id, changes) {
      await wait();
      const user = requireAdmin();
      const m = db.matches.find((x) => x.id === Number(id));
      if (!m) throw new ApiError(404, '매칭 내역을 찾을 수 없어요.', 'NOT_FOUND');
      const before = m.status;
      if (changes.status !== undefined) {
        if (!MATCH_STATUS.some((s) => s.value === changes.status)) throw new ApiError(400, '알 수 없는 매칭 상태예요.', 'VALIDATION');
        m.status = changes.status;
      }
      if (changes.memo !== undefined) m.memo = String(changes.memo).slice(0, 300);
      m.updatedAt = nowIso();
      if (before !== m.status) syncStatuses(m);
      audit(user, 'MATCH_UPDATE', `매칭 #${m.id}`,
        before !== m.status ? `${textOf(MATCH_STATUS, before)} → ${textOf(MATCH_STATUS, m.status)}` : '메모 수정');
      commit();
      return clone(m);
    },

    async deleteMatch(id) {
      await wait();
      const user = requireAdmin();
      const m = db.matches.find((x) => x.id === Number(id));
      if (!m) throw new ApiError(404, '매칭 내역을 찾을 수 없어요.', 'NOT_FOUND');
      db.matches = db.matches.filter((x) => x !== m);
      syncStatuses({ ...m, status: 'DECLINED' });
      audit(user, 'MATCH_DELETE', `매칭 #${m.id}`);
      commit();
      return null;
    },

    async listAuditLogs() {
      await wait();
      requireAdmin();
      return clone(db.auditLogs);
    },

    async recordExport(count) {
      const user = requireAdmin();
      audit(user, 'EXPORT', '신청자 목록', `${count}명`);
      commit();
      return null;
    },
  },

  /** mock 전용: 가짜 DB를 처음 상태로 되돌린다 */
  dev: {
    reset() {
      db = createSeed();
      commit();
      setSession({});
    },
  },
};
