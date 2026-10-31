/**
 * 사緣 핵심 서비스 — 신청·오늘의 인연·하트·매칭·후기·쪽지·관리자 규칙이 모두 여기 있다.
 * 브라우저 개발 모드(api/mock)와 Node.js 서버(server/)가 이 파일을 함께 쓴다
 *  → 화면에서 시험한 동작이 운영 서버에서도 똑같이 돈다.
 * 저장소·세션·사내 인증·관리자 확인은 configureService()로 끼워 넣는다.
 *   개발 모드: localStorage / sessionStorage / 가짜 임직원 (api/mock/index.js)
 *   서버    : MSSQL / 요청 세션 / 사내 AD·SSO(server/src/sso.js) / 관리자 계정(server/config/admins.js)
 * 응답 형태·오류 코드는 http.js(화면 쪽 호출)와 같다.
 */
import { ApiError } from '../errors.js';
import { scoreCandidates, busyIds, activeIds, matchStory } from './matching.js';
import { compatibility } from '../../utils/saju.js';
import { suggestNicknames } from '../../utils/nickname.js';
import { validateApplication, ageOf, yearOf } from '../../utils/applicationRules.js';
import { FIELD_LABELS } from '../../utils/applicationModel.js';
import { initials } from '../../utils/format.js';
import { DEFAULT_CODES } from '../../constants/defaultCodes.js';
import {
  APPLY_STATUS, APPLY_STATUS_MAP, MANUAL_APPLY_STATUS, MATCH_STATUS, ACTIVE_MATCH_STATUS, BUSY_MATCH_STATUS, PENDING_MATCH_STATUS, CODE_GROUP_MAP, PREF_ITEMS, RECOMMENDABLE_STATUS,
  DAILY_CARD_LIMIT, DAILY_HEART_LIMIT, RESHOW_AFTER_DAYS, textOf,
  DEFAULT_SETTINGS, REVIEW_OUTCOMES, REVIEW_RATINGS, REVIEWABLE_MATCH_STATUS, REVIEW_WINDOW_DAYS,
  VOC_CATEGORIES, VOC_STATUS, SETTING_ITEMS, REFERENCE_KIND, toBool, GENDERS,
} from '../../constants/codes.js';
import { ADMIN_IDLE_MS, ADMIN_LOCK_MS, ADMIN_MAX_FAILS, ADMIN_LOCK_MINUTES } from '../../constants/policy.js';
import { TABLES, TABLE_BY_COLL, rowsOf, cellOf, keyColsOf } from '../../db/tables.js';

const DAY = 86400000;

/** 신청자가 저장할 수 있는 항목 화이트리스트 (그 외 키는 무시) */
// 이름은 사내 인사정보로만 채운다 — 화면에서 보낸 값은 무시 (위·변조 방지)
const APP_FIELDS = [
  'nickname', 'serious', 'gender', 'birthYear', 'heightBand', 'hobbies', 'mbti', 'religion', 'agreeSensitive',
  'residence', 'division', 'team', 'campus', 'building', 'comment', 'face', 'body', 'looks', 'drinking', 'smoking',
  'prefAgeMin', 'prefAgeMax', 'prefHeightMin', 'prefHeightMax', 'avoid',
  ...PREF_ITEMS.filter((p) => p.kind === 'multi').map((p) => p.key),
  'priorities', 'agreePrivacy', 'agreeShare',
];
const ADMIN_EDITABLE = [...APP_FIELDS.filter((f) => !f.startsWith('agree')), 'status', 'adminMemo'];

/** 기준정보 그룹 → 그 코드를 쓰는 신청서 항목 (삭제 가능 여부 확인용) */
const CODE_USAGE = {
  DIVISION: ['division', 'prefDivisions'], CAMPUS: ['campus'],
  HEIGHT: ['heightBand', 'prefHeightMin', 'prefHeightMax'], FACE: ['face', 'prefFaces'], BODY: ['body', 'prefBodies'],
  LOOKS: ['looks'], MBTI: ['mbti', 'prefMbtis'], HOBBY: ['hobbies', 'prefHobbies'], DRINKING: ['drinking', 'prefDrinking'],
  SMOKING: ['smoking', 'prefSmoking'], RELIGION: ['religion', 'prefReligions'],
};

// ── 끼워 넣는 부분(어댑터) ───────────────────────────────
/**
 * @typedef {object} Profile 사내 인증이 돌려주는 임직원 정보
 * @property {string} empNo  사번 (필수)
 * @property {string} adId   사내 계정 ID
 * @property {string} name
 * @property {'M'|'F'|null} gender
 * @property {string|null} division 사업부 코드 (기준정보 DIVISION 값)
 * @property {string} team
 * @property {string} email
 * @property {boolean} active 재직 여부
 *
 * @typedef {object} Adapters
 * @property {() => object|null} load       저장된 데이터 (처음이면 null)
 * @property {() => object} initial         처음 데이터
 * @property {(db: object) => void} persist  바뀐 데이터 저장 (서버는 응답 전에 flush)
 * @property {{ get: () => object|null, set: (s: object) => void }} session 로그인 세션
 * @property {{ authenticate: Function, identify?: Function, search?: Function, lookup?: Function }} directory 사내 인증
 *   authenticate(account, password, db) → Profile|null · identify() → Profile|null (SSO)
 *   search(q) → Profile[] · lookup(empNo) → Profile|null (블랙리스트 등록용, 선택)
 * @property {{ isAdmin: (emp: object, db: object) => boolean, verify: (password: string, emp: object) => boolean|Promise<boolean> }} admin
 * @property {() => Promise<void>} [delay]   응답 지연 흉내 (개발 모드)
 * @property {() => string} [clientIp]       열람 기록에 남길 접속 IP
 * @property {boolean} [allowDev]            개발 모드 전용 기능(가짜 데이터 초기화 등) 허용
 * @property {() => object[]} [devAccounts]  개발 화면(npm run dev) 테스트 사번 목록 (서버만)
 */
let A = null;
let db = null;

/** 저장된 데이터를 지금 코드가 기대하는 모양으로 맞춘다 (불러올 때·초기화할 때 모두) */
function normalize(d) {
  for (const k of ['employees', 'applicants', 'matches', 'hearts', 'reviews', 'vocs', 'messages', 'blacklist', 'auditLogs']) d[k] ??= [];
  for (const k of ['sajuPicks', 'penalties', 'daily', 'seen', 'adminLocks']) d[k] ??= {};
  d.codes ??= {};
  for (const [group, items] of Object.entries(DEFAULT_CODES)) d.codes[group] ??= JSON.parse(JSON.stringify(items));
  d.settings = { ...DEFAULT_SETTINGS, ...(d.settings ?? {}) };
  delete d.settings.matchStartCount; // 예전 설정(숫자 기준 팝업) 정리
  d.seq = { applicant: 0, match: 0, audit: 0, heart: 0, review: 0, voc: 0, message: 0, ...(d.seq ?? {}) };
  // 개인정보 보호: 생년월일(월·일)·태어난 시간은 저장하지 않는다 — 예전 데이터는 출생연도만 남기고 지운다
  for (const x of [...d.applicants, ...d.employees]) {
    if (x.birthYear == null && x.birthDate) x.birthYear = yearOf(x.birthDate);
    delete x.birthDate;
    delete x.birthTime;
  }
  for (const p of Object.values(d.sajuPicks)) {
    delete p.birthDate;
    delete p.birthTime;
  }
  return d;
}

/** 저장소·세션·인증을 연결하고 데이터를 불러온다. 다른 함수보다 먼저 한 번 불러야 한다 */
export function configureService(adapters) {
  A = adapters;
  db = normalize(A.load() ?? A.initial());
  commit();
}
/** 서버 점검용 (건강 확인·관리 스크립트) */
export const serviceDb = () => db;

const commit = () => A.persist(db);
const wait = () => (A.delay ? A.delay() : Promise.resolve());
/** 화면에서 넘어온 Vue reactive 프록시도 복사할 수 있도록 JSON 복사 (structuredClone은 Proxy를 못 다룬다) */
const clone = (v) => (v === undefined ? v : JSON.parse(JSON.stringify(v)));
const nowIso = () => new Date().toISOString();
const pickFields = (src, keys) => Object.fromEntries(keys.filter((k) => k in src).map((k) => [k, clone(src[k])]));
/** 한국 날짜(YYYY-MM-DD) — 하루 단위 제한은 KST 자정 기준 */
const kstDate = (t = Date.now()) => new Date(t + 9 * 3600000).toISOString().slice(0, 10);

// ── 세션 / 권한 ──────────────────────────────────────────
const getSession = () => A.session.get() ?? {};
const setSession = (s) => A.session.set(s);

/** 블랙리스트 — 담당자가 등록한 사번은 신청·사주 하트를 할 수 없고, 이미 낸 신청서도 매칭에서 빠진다 */
const isBlacklisted = (empNo) => db.blacklist.some((b) => b.empNo === empNo);
const isAdminAccount = (e) => Boolean(e && A.admin.isAdmin(e, db));
/** 관리자 비밀번호를 넣어 볼 수 있는 계정 — 등록된 관리자가 없으면 누구나 (비밀번호만으로 관리자) */
const canEnterAdmin = (e) => Boolean(e && (A.admin.canEnter ?? A.admin.isAdmin)(e, db));

/**
 * 로그인 사용자 정보 — 화면은 이 값으로 관리자·신청자·미신청자를 나눈다
 *  role: ADMIN(관리자 계정) | APPLICANT(신청서 있음) | GUEST(아직 신청 전)
 *  applicant.userStatus: WAITING(매칭 대기 중) | MATCHING(매칭 중) | COUPLED(커플 성사)
 */
const publicUser = (e) => {
  const app = myApplication(e);
  const isAdmin = isAdminAccount(e);
  return {
    empNo: e.empNo, adId: e.adId, name: e.name, gender: e.gender, division: e.division, team: e.team,
    blocked: isBlacklisted(e.empNo),
    isAdmin,
    applicant: app ? { id: app.id, userStatus: userStatusOf(app), quick: Boolean(app.quick) } : null,
    role: isAdmin ? 'ADMIN' : app ? 'APPLICANT' : 'GUEST',
  };
};

/** 사내 인증 정보로 임직원 목록(로그인 이력)을 갱신한다 */
function upsertEmployee(p) {
  if (!p?.empNo) throw new ApiError(502, '사내 인증 정보에 사번이 없어요. 담당자에게 문의해 주세요.', 'SSO_PROFILE');
  const empNo = String(p.empNo).trim();
  const fields = {
    adId: p.adId ?? '', name: p.name ?? '', gender: p.gender ?? null, division: p.division ?? null,
    team: p.team ?? '', email: p.email ?? '', retired: p.active === false,
    // 개발 화면(npm run dev) 테스트 사번 — 일반 사용자에게 보이지 않게 표시해 둔다 (visibleTo)
    test: p.test === true || undefined,
  };
  let e = db.employees.find((x) => x.empNo === empNo);
  if (e) Object.assign(e, fields);
  else {
    e = { empNo, ...fields };
    db.employees.push(e);
  }
  return e;
}

function startSession(profile) {
  const emp = upsertEmployee(profile);
  commit();
  if (emp.retired) throw new ApiError(403, '재직 중인 임직원만 이용할 수 있어요.', 'NOT_ACTIVE_EMPLOYEE');
  setSession({ empNo: emp.empNo });
  return { user: publicUser(emp), adminExpiresAt: 0 };
}

function requireUser() {
  const emp = db.employees.find((e) => e.empNo === getSession().empNo && !e.retired);
  if (!emp) throw new ApiError(401, '로그인이 필요해요.', 'UNAUTHENTICATED');
  return emp;
}

function requireAdmin() {
  const user = requireUser();
  const s = getSession();
  if (!(s.adminExpiresAt > Date.now()) || !canEnterAdmin(user)) {
    throw new ApiError(403, '관리자 모드가 종료됐어요. 다시 인증해 주세요.', 'ADMIN_REQUIRED');
  }
  setSession({ ...s, adminExpiresAt: Date.now() + ADMIN_IDLE_MS }); // 활동할 때마다 연장
  return user;
}

function audit(actor, action, target = '', detail = '') {
  db.auditLogs.unshift({
    id: ++db.seq.audit, at: nowIso(), actorEmpNo: actor.empNo, actorName: actor.name,
    action, target, detail, ip: A.clientIp?.() ?? '-',
  });
}

const findApplicant = (id) => {
  const a = db.applicants.find((x) => x.id === Number(id));
  if (!a) throw new ApiError(404, '신청서를 찾을 수 없어요. 이미 삭제됐을 수 있어요.', 'NOT_FOUND');
  return a;
};
const myApplication = (user) => db.applicants.find((a) => a.empNo === user.empNo);
/** 기록·목록에 남기는 신청자 표시: 번호 + 초성 (이름 원문은 남기지 않는다) */
const tag = (a) => `#${a.id} ${initials(a.name)}`;
const withAge = (a) => ({ ...clone(a), age: ageOf(a.birthYear) });

/** 매칭 상태에 맞춰 두 신청자의 상태를 맞춘다 */
function syncStatuses(m) {
  for (const id of [m.aId, m.bId]) {
    const a = db.applicants.find((x) => x.id === id);
    if (!a) continue;
    if (m.status === 'PROPOSED') a.status = 'MATCHING';
    else if (m.status === 'ACCEPTED' || m.status === 'MET') a.status = 'MATCHED';
    else if (m.status === 'COUPLE') a.status = 'COUPLED';
    else {
      const involves = (o) => o.id !== m.id && (o.aId === id || o.bId === id);
      const stillActive = db.matches.some((o) => involves(o) && ACTIVE_MATCH_STATUS.includes(o.status));
      const stillCouple = db.matches.some((o) => involves(o) && o.status === 'COUPLE');
      // 커플 매칭이 끝나거나(관리자 삭제·상대 탈퇴) 사라지면 남은 사람도 '커플 성사'에서 풀어준다
      // (예전: MATCHING/MATCHED만 되돌려서 상대 없는 '커플 성사' 상태에 갇혔다)
      const derived = a.status === 'MATCHING' || a.status === 'MATCHED' || (a.status === 'COUPLED' && !stillCouple);
      if (!stillActive && derived) a.status = 'REVIEWING';
    }
    a.updatedAt = nowIso();
  }
}

function removeApplicant(a) {
  // 싫어요 제재는 탈퇴 후 재가입으로 피할 수 없게 '횟수'만 사번 기준으로 남긴다 (후기 내용은 지운다)
  const n = dislikesOf(a);
  if (n > 0) db.penalties[a.empNo] = { count: n, at: nowIso() };
  // 이 사람이 남긴 싫어요는 상대의 누적 횟수로 옮겨 두고 후기 원문은 지운다
  for (const r of db.reviews.filter((x) => x.reviewerId === a.id && countsAsDislike(x))) {
    const t = db.applicants.find((x) => x.id === r.targetId);
    if (t) t.dislikeCarry = (t.dislikeCarry ?? 0) + 1;
  }
  db.reviews = db.reviews.filter((r) => r.reviewerId !== a.id && r.targetId !== a.id);
  db.messages = db.messages.filter((m) => m.toId !== a.id && m.fromId !== a.id && m.thread !== `A${a.id}`);
  db.vocs = db.vocs.map((v) => (v.ownerEmpNo === a.empNo ? { ...v, ownerEmpNo: null } : v)); // VOC는 남기되 작성자 연결은 끊는다
  const related = db.matches.filter((m) => m.aId === a.id || m.bId === a.id);
  db.applicants = db.applicants.filter((x) => x.id !== a.id);
  db.matches = db.matches.filter((m) => !related.includes(m));
  db.hearts = db.hearts.filter((h) => h.fromId !== a.id && h.toId !== a.id);
  delete db.daily[a.id];
  delete db.seen[a.id];
  for (const m of related) syncStatuses({ ...m, status: 'DECLINED' });
  // 진행 중이던 매칭·커플 상대에게는 끝났다는 사실만 담당자 쪽지로 알린다
  // ('다시 인연 찾기'는 안내 쪽지가 가는데 탈퇴는 아무 말 없이 사라지던 문제)
  const t = nowIso();
  for (const m of related.filter((x) => ACTIVE_MATCH_STATUS.includes(x.status) || x.status === 'COUPLE')) {
    const partnerId = m.aId === a.id ? m.bId : m.aId;
    if (!db.applicants.some((x) => x.id === partnerId)) continue;
    db.messages.push({
      id: ++db.seq.message, thread: `A${partnerId}`, fromId: null, fromAdmin: true, adminName: '사緣', toId: partnerId, auto: true,
      body: m.status === 'COUPLE'
        ? '[자동 안내] 커플로 이어졌던 상대가 사緣을 떠나 커플 상태가 종료됐어요. 매칭 대기 중으로 돌아왔어요.'
        : '[자동 안내] 진행 중이던 매칭이 종료되어 매칭 대기 중으로 돌아왔어요. 새 인연을 찾아드릴게요.',
      at: t, readAt: null, box: {},
    });
  }
}

// ── 싫어요 제재 ─────────────────────────────────────────
const countsAsDislike = (r) => r.rating === 'DISLIKE' || (r.outcome === 'NOSHOW' && db.settings.noShowCountsAsDislike);
/** 받은 싫어요 수 = 후기 싫어요(+노쇼) + 탈퇴자에게서 옮겨온 수 + 재가입 전 누적 - 관리자 해제분 */
const dislikesOf = (a) =>
  Math.max(0, db.reviews.filter((r) => r.targetId === a.id && countsAsDislike(r)).length + (a.dislikeCarry ?? 0) + (a.penalty ?? 0) - (a.dislikeOffset ?? 0));
/** 싫어요가 기준 이상이면 추천·하트·관리자 추천 후보에서 모두 빠진다 (본인 화면에는 알리지 않음) */
const isSanctioned = (a) => dislikesOf(a) >= db.settings.dislikeLimit;
const matchPool = () => db.applicants.filter((a) => !isSanctioned(a) && !isBlacklisted(a.empNo));
/**
 * 개발 테스트 데이터 가리기 — 테스트 사번(npm run dev)으로 만든 신청서는 일반 사용자의 후보·하트·사주에 나오지 않는다.
 * 테스트 사번은 운영 데이터를 함께 본다 (개발 화면에서 실제 화면처럼 확인)
 */
const visibleTo = (viewer) => (c) => !c?.test || Boolean(viewer?.test);

/**
 * 본인에게 보이는 상태는 두 가지뿐: 매칭 중 / 매칭 대기 중
 * (접수·검토·보류·불발·거절은 모두 '매칭 대기 중')
 */
const userStatusOf = (a) => {
  if (a.status === 'COUPLED') return 'COUPLED';
  return activeIds(db.matches).has(a.id) || a.status === 'MATCHING' || a.status === 'MATCHED' ? 'MATCHING' : 'WAITING';
};
/** 내가 보낸 하트 중 아직 답을 기다리는 것 (72시간 지나면 만료) */
const pendingHeartOf = (a) => {
  expireHearts();
  return db.hearts.find((h) => h.fromId === a.id && h.status === 'SENT') ?? null;
};
/** 신청서 수정 잠금 이유: 매칭 중 · 하트 응답 대기 중 · 커플 완료 */
const lockReasonOf = (a) => {
  const st = userStatusOf(a);
  if (st === 'MATCHING') return 'MATCHING';
  if (st === 'COUPLED') return 'COUPLED';
  // 사주 간편 신청(임시)은 하트를 보낸 상태에서도 나머지 신청서를 마저 채울 수 있어야 한다
  if (pendingHeartOf(a) && !a.quick) return 'HEART';
  return null;
};

/**
 * 지금 새 후보·하트를 주고받을 수 없는 이유. 화면이 버튼을 숨기는 것과 별개로 API에서 막는다
 * (서버 구현도 같은 규칙 — 화면만 막으면 API를 직접 불러 우회할 수 있다)
 */
function matchingBlockOf(app) {
  if (isBlacklisted(app.empNo)) return 'BLOCKED';
  if (app.status === 'COUPLED') return 'COUPLED';
  if (userStatusOf(app) === 'MATCHING') return 'MATCHING';
  if (db.settings.holdUntilStart) return 'GATHERING';
  // 보류·스스로 쉬기·싫어요 제재·하트 맞교환 승인 대기 (승인 대기 사실은 본인에게 알리지 않는다)
  if (app.status === 'HOLD' || isSanctioned(app) || pendingMatchOf(app)) return 'PAUSED';
  return null;
}
const BLOCK_ERRORS = {
  BLOCKED: [403, '지금은 사緣을 이용할 수 없는 계정이에요.', 'BLACKLISTED'],
  COUPLED: [409, '커플 완료 상태라 새 하트를 주고받지 않아요.', 'COUPLED'],
  MATCHING: [409, '매칭이 진행 중이라 새 후보·하트를 쓸 수 없어요.', 'MATCHING'],
  GATHERING: [409, '오픈 준비 중이라 아직 매칭이 시작되지 않았어요. 시작되면 가장 먼저 알려드릴게요.', 'MATCHING_PAUSED'],
  PAUSED: [409, '지금은 새 후보를 준비 중이에요. 조금만 기다려 주세요.', 'PAUSED'],
};
function assertCanMatch(app) {
  const reason = matchingBlockOf(app);
  if (reason) throw new ApiError(...BLOCK_ERRORS[reason]);
}

/** 본인 신청서 응답 — 내부 상태·관리 메모는 빼고 보낸다 */
const userView = (a) => {
  const { adminMemo, status, dislikeCarry, dislikeOffset, penalty, selfPaused, ...rest } = clone(a);
  const userStatus = userStatusOf(a);
  return {
    ...rest,
    name: initials(a.name), // 신청 후에는 본인 화면에서도 초성만
    age: ageOf(a.birthYear),
    userStatus,
    editLocked: Boolean(lockReasonOf(a)), // 매칭 중·하트 응답 대기 중에는 수정 불가
    lockReason: lockReasonOf(a),
    selfPaused: Boolean(selfPaused),
  };
};

/**
 * 후보 카드 — 넘겨보기 전용 간략 정보 (이름은 초성만, 팀·건물·외모·생년월일 제외)
 * viewer를 주면 '잘 맞는 부분' 문장과 사주 궁합 결과를 덧붙인다 (상대 생년월일은 보내지 않음)
 */
const card = (c, score, viewer = null) => ({
  name: initials(c.name),
  nickname: c.nickname,
  serious: c.serious,
  ...(viewer && { story: matchStory(viewer, c, db.codes), gunghap: safeGunghap(viewer, c) }),
  age: ageOf(c.birthYear),
  division: c.division,
  campus: c.campus,
  heightBand: c.heightBand,
  face: c.face,
  body: c.body,
  mbti: c.mbti,
  drinking: c.drinking,
  smoking: c.smoking,
  hobbies: c.hobbies.slice(0, 3),
  comment: (c.comment ?? '').slice(0, 80),
  score,
});

function safeGunghap(a, b) {
  try {
    // a: 사주 화면에서 입력한 생년월일(저장 안 함) 또는 신청서의 출생연도 · b: 신청서의 출생연도
    return compatibility(a.birthDate ? { birthDate: a.birthDate, birthTime: a.birthTime } : { birthYear: a.birthYear }, { birthYear: b.birthYear });
  } catch {
    return null;
  }
}

/** 관리자 'DB 표' — 표 이름(coll)으로 정의 찾기 */
function tableOf(coll) {
  const t = TABLE_BY_COLL[String(coll ?? '')];
  if (!t) throw new ApiError(404, '없는 표예요.', 'NOT_FOUND');
  return t;
}

const nicknameTaken = (nick, exceptId = null) => db.applicants.some((a) => a.nickname === nick && a.id !== exceptId);

function codeInUse(group, value) {
  const fields = CODE_USAGE[group] ?? [];
  const n = db.applicants.filter((a) => fields.some((f) => (Array.isArray(a[f]) ? a[f].includes(value) : a[f] === value))).length;
  const children = 0;
  return { n, children };
}

/** 설정 변경을 검사해 바뀐 설정을 돌려준다 (잘못된 값이면 ApiError) — 설정 화면 · 일괄 변경이 함께 쓴다 */
function settingsAfter(base, changes) {
  const next = { ...base };
  for (const item of SETTING_ITEMS) {
    if (changes[item.key] === undefined) continue;
    const raw = changes[item.key];
    if (item.type === 'bool') {
      const v = toBool(raw);
      if (v === null) throw new ApiError(400, `'${item.text}' 값은 Y 또는 N으로 적어주세요.`, 'VALIDATION');
      next[item.key] = v;
    } else {
      const n = Number(raw);
      if (!Number.isInteger(n) || n < item.min || n > item.max) {
        throw new ApiError(400, `'${item.text}' 값은 ${item.min}~${item.max} 사이 정수로 적어주세요.`, 'VALIDATION');
      }
      next[item.key] = n;
    }
  }
  return next;
}

// ── 기준정보 일괄 변경 ─────────────────────────────────
// 내보내기(엑셀·JSON) → 파일에서 고치기 → 가져오기(미리보기) → 적용
//  - 파일에 있는 그룹만 바꾼다. 파일에 없는 그룹은 그대로 둔다
//  - 그룹 안에서 파일에 없는 항목: 신청서가 쓰고 있으면 '사용 안 함'으로, 아무도 안 쓰면 삭제
//  - 코드 값은 바꿀 수 없다(신청서가 참조). 바꾸려면 새 코드를 추가하고 예전 코드는 빼거나 '사용 안 함'
const CODE_FIELDS = ['text', 'order', 'use', 'parent', 'attr'];
const FIELD_NAMES = { text: '이름', order: '순서', use: '사용', parent: '상위', attr: '보조 값' };

function planReference(payload) {
  const errors = [];
  const notes = [];
  const changes = [];
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new ApiError(400, '파일 내용을 읽지 못했어요. 사緣에서 내보낸 엑셀·JSON 파일인지 확인해 주세요.', 'VALIDATION');
  }
  if (payload.kind !== undefined && payload.kind !== REFERENCE_KIND) errors.push('사緣 기준정보 파일이 아니에요.');
  const codesIn = payload.codes ?? {};
  if (typeof codesIn !== 'object' || Array.isArray(codesIn)) errors.push('기준정보(codes) 형식이 맞지 않아요.');
  const nextCodes = clone(db.codes);

  for (const [group, items] of Object.entries(errors.length ? {} : codesIn)) {
    const g = CODE_GROUP_MAP[group];
    if (!g) {
      errors.push(`없는 기준정보 그룹이에요: ${group} (쓸 수 있는 그룹: ${Object.keys(CODE_GROUP_MAP).join(', ')})`);
      continue;
    }
    if (!Array.isArray(items) || !items.length) {
      errors.push(`${g.text}: 항목이 없어요. 이 그룹을 바꾸지 않으려면 파일에서 그룹째 빼 주세요.`);
      continue;
    }
    const incoming = [];
    const seen = new Set();
    items.forEach((raw, i) => {
      const where = `${g.text} ${raw?.row ? `${raw.row}행` : `${i + 1}번째`}`;
      const value = String(raw?.value ?? '').trim().toUpperCase();
      if (!/^[A-Z0-9_]{1,30}$/.test(value)) return errors.push(`${where}: 코드 '${raw?.value ?? ''}' — 영문 대문자·숫자·_ 30자 이내로 적어주세요.`);
      if (seen.has(value)) return errors.push(`${g.text}: 코드 ${value} 가 두 번 있어요.`);
      seen.add(value);
      const text = String(raw?.text ?? '').trim();
      if (!text || text.length > 40) return errors.push(`${where}(${value}): 표시 이름을 1~40자로 적어주세요.`);
      const order = raw.order === undefined || raw.order === null || raw.order === '' ? (i + 1) * 10 : Number(raw.order);
      if (!Number.isFinite(order)) return errors.push(`${where}(${value}): 순서는 숫자로 적어주세요.`);
      const use = raw.use === undefined || raw.use === null || raw.use === '' ? true : toBool(raw.use);
      if (use === null) return errors.push(`${where}(${value}): 사용 여부는 Y 또는 N으로 적어주세요.`);
      const item = { value, text, order, use };
      if (g.parent) item.parent = String(raw.parent ?? '').trim().toUpperCase();
      if (g.attrLabel) item.attr = String(raw.attr ?? '').trim().slice(0, 20);
      incoming.push(item);
      return null;
    });

    const cur = db.codes[group] ?? [];
    const next = [];
    for (const it of incoming) {
      const old = cur.find((c) => c.value === it.value);
      if (!old) {
        changes.push({ group, value: it.value, text: it.text, action: 'ADD' });
        next.push(it);
        continue;
      }
      const fields = CODE_FIELDS.filter((k) => k in it && it[k] !== old[k] && !(k === 'attr' && !it[k] && !old[k]));
      if (fields.includes('parent') && codeInUse(group, it.value).n) {
        errors.push(`${g.text} ${it.value}: 신청서가 쓰고 있는 항목이라 상위 항목을 바꿀 수 없어요.`);
      }
      if (fields.length) {
        changes.push({
          group, value: it.value, text: it.text, action: 'UPDATE',
          detail: fields.map((k) => `${FIELD_NAMES[k]}: ${old[k] ?? '-'} → ${it[k] ?? '-'}`).join(' · '),
        });
      }
      next.push({ ...old, ...it });
    }
    for (const old of cur) {
      if (incoming.some((it) => it.value === old.value)) continue;
      const { n } = codeInUse(group, old.value);
      if (n) {
        next.push({ ...old, use: false });
        if (old.use) changes.push({ group, value: old.value, text: old.text, action: 'DISABLE', detail: `신청서 ${n}건이 쓰고 있어 지우지 않고 '사용 안 함'으로 바꿔요` });
        else notes.push(`${g.text} ${old.value}: 파일에 없지만 신청서 ${n}건이 써서 '사용 안 함'으로 남겨 둬요.`);
      } else {
        changes.push({ group, value: old.value, text: old.text, action: 'REMOVE' });
      }
    }
    if (incoming.length && !next.some((c) => c.use)) errors.push(`${g.text}: '사용'인 항목이 하나는 있어야 해요.`);
    nextCodes[group] = next.sort((a, b) => a.order - b.order);
  }

  // 상위 항목 확인은 모든 그룹을 반영한 뒤에 (상위 그룹도 같은 파일에서 바뀔 수 있다)
  for (const [group, items] of Object.entries(nextCodes)) {
    const g = CODE_GROUP_MAP[group];
    if (!g?.parent || !(group in codesIn)) continue;
    for (const it of items) {
      if (!nextCodes[g.parent]?.some((p) => p.value === it.parent)) {
        errors.push(`${g.text} ${it.value}: 상위 ${CODE_GROUP_MAP[g.parent].text} '${it.parent || '(빈칸)'}' 이(가) 없어요.`);
      }
    }
  }

  // 설정
  let nextSettings = null;
  const settingsChanges = [];
  if (payload.settings !== undefined && payload.settings !== null) {
    if (typeof payload.settings !== 'object' || Array.isArray(payload.settings)) errors.push('설정(settings) 형식이 맞지 않아요.');
    else {
      const known = Object.fromEntries(Object.entries(payload.settings).filter(([k]) => SETTING_ITEMS.some((x) => x.key === k)));
      for (const k of Object.keys(payload.settings)) if (!(k in known)) notes.push(`설정 '${k}'은(는) 모르는 항목이라 건너뛰어요.`);
      try {
        nextSettings = settingsAfter(db.settings, known);
        for (const item of SETTING_ITEMS) {
          if (nextSettings[item.key] !== db.settings[item.key]) {
            settingsChanges.push({ key: item.key, text: item.text, before: db.settings[item.key], after: nextSettings[item.key] });
          }
        }
      } catch (e) {
        errors.push(`설정: ${e.message}`);
      }
    }
  }

  const summary = {};
  for (const ch of changes) {
    const row = (summary[ch.group] ??= { group: ch.group, text: CODE_GROUP_MAP[ch.group].text, ADD: 0, UPDATE: 0, DISABLE: 0, REMOVE: 0 });
    row[ch.action] += 1;
  }
  return { errors, notes, changes, settingsChanges, summary: Object.values(summary), nextCodes, nextSettings };
}

// ── 오늘의 후보 ─────────────────────────────────────────
/** 보낸 하트는 72시간 안에 답이 없으면 만료 — 보낸 사람의 '응답 대기' 블락이 풀린다 */
const HEART_TTL_MS = 72 * 3600000;
function expireHearts() {
  const now = Date.now();
  for (const h of db.hearts) if (h.status === 'SENT' && now - Date.parse(h.at) > HEART_TTL_MS) Object.assign(h, { status: 'EXPIRED', answeredAt: nowIso() });
}

const heartsSentToday = (app) => db.hearts.filter((h) => h.fromId === app.id && kstDate(Date.parse(h.at)) === kstDate()).length;
// 블랙리스트도 함께 본다 — 오늘의 후보가 정해진 뒤 등록된 사람에게 하트가 가지 않도록
// viewer: 이 후보를 보는 사람 — 일반 사용자에게는 테스트 신청서가 후보가 될 수 없다
const isActiveCandidate = (c, viewer) =>
  c && RECOMMENDABLE_STATUS.includes(c.status) && !busyIds(db.matches).has(c.id) && !isSanctioned(c) && !isBlacklisted(c.empNo) && visibleTo(viewer)(c);
/** 오늘의 후보·사주 추천 대상: 제재·임시 신청(정보 부족)·(일반 사용자에게) 테스트 신청서 제외 */
const recommendPool = (viewer) => matchPool().filter((a) => !a.quick && visibleTo(viewer)(a));

/** 오늘 볼 후보 3명을 정한다 (하루에 한 번, 이미 본 사람은 30일간 제외) */
function ensureDaily(app) {
  const today = kstDate();
  const cur = db.daily[app.id];
  if (cur?.date === today) return cur;

  const seen = db.seen[app.id] ?? {};
  const cutoff = kstDate(Date.now() - RESHOW_AFTER_DAYS * DAY);
  const exclude = new Set(Object.entries(seen).filter(([, d]) => d > cutoff).map(([id]) => Number(id)));
  for (const h of db.hearts) {
    if (h.fromId === app.id) exclude.add(h.toId); // 이미 하트를 보낸 상대
    if (h.toId === app.id && h.status === 'SENT') exclude.add(h.fromId); // 나에게 하트를 보낸 상대는 '받은 하트'에서 보여준다
  }
  const picks = scoreCandidates(app, recommendPool(app), db.matches, db.codes, { exclude, recommendableOnly: true, limit: DAILY_CARD_LIMIT });
  const daily = { date: today, items: picks.map((p) => ({ id: p.applicant.id, score: p.score })), cursor: 0, heartTo: null };
  db.seen[app.id] = { ...seen, ...Object.fromEntries(daily.items.map((i) => [i.id, today])) };
  db.daily[app.id] = daily;
  return daily;
}

/**
 * 매칭이 생긴 두 사람에게 걸린 다른 '응답 대기' 하트를 끝낸다.
 * 예전: A가 B에게 하트를 보낸 뒤 B가 다른 사람과 이어지면 A의 하트가 응답 대기로 남아
 *       A는 최대 72시간 동안 새 후보를 받지 못했다 (B가 바쁜 동안 A 쪽 받은 하트 목록에서도 안 보였다)
 * 상대에게는 이유를 알리지 않는다 — 보낸 사람 화면에서는 '응답 없음'으로 끝난 것과 같다
 */
function closeOpenHearts(ids) {
  const t = nowIso();
  for (const h of db.hearts) {
    if (h.status === 'SENT' && (ids.includes(h.fromId) || ids.includes(h.toId))) Object.assign(h, { status: 'EXPIRED', answeredAt: t });
  }
}

/**
 * 하트 맞교환 — 바로 매칭하지 않고 '승인 대기'로 둔다. 관리자가 '매칭 승인 대기'에서 승인해야 양측 수락이 된다.
 * 두 사람 화면에는 매칭 대기 중(새 후보 준비 중)으로 보이고, 다른 사람의 후보·하트에서는 빠진다 (busyIds)
 */
function createHeartMatch(a, b, score) {
  const t = nowIso();
  const m = { id: ++db.seq.match, aId: a.id, bId: b.id, score, status: PENDING_MATCH_STATUS, source: 'HEART', memo: '하트 맞교환 — 담당자 승인 대기', createdBy: '(하트 맞교환)', createdAt: t, updatedAt: t };
  db.matches.push(m);
  closeOpenHearts([a.id, b.id]);
  return m;
}
/** 하트 맞교환 승인 대기 중인 매칭 */
const pendingMatchOf = (app) => db.matches.find((m) => m.status === PENDING_MATCH_STATUS && (m.aId === app.id || m.bId === app.id)) ?? null;
/** 관리자 화면 '매칭 여부' — NONE 매칭 없음 · PENDING 승인 대기 · MATCHING 매칭 중 · COUPLED 커플 */
const matchStateOf = (a) => (a.status === 'COUPLED' ? 'COUPLED' : userStatusOf(a) === 'MATCHING' ? 'MATCHING' : pendingMatchOf(a) ? 'PENDING' : 'NONE');
/** 다른 진행 중·승인 대기 매칭이 있는가 (m 은 빼고) */
const busyElsewhere = (m) =>
  db.matches.some((o) => o.id !== m.id && (BUSY_MATCH_STATUS.includes(o.status) || o.status === 'COUPLE') && [o.aId, o.bId].some((x) => x === m.aId || x === m.bId));

/** 승인 대기 → 양측 수락. 두 분에게 담당자 쪽지로 알린다 */
function approvePending(m, user) {
  if (m.status !== PENDING_MATCH_STATUS) throw new ApiError(409, '승인 대기 중인 매칭이 아니에요. 새로고침해 주세요.', 'NOT_PENDING');
  const a = db.applicants.find((x) => x.id === m.aId);
  const b = db.applicants.find((x) => x.id === m.bId);
  if (!a || !b) throw new ApiError(409, '두 분 중 한 분이 탈퇴했어요. 반려해 주세요.', 'CANDIDATE_GONE');
  if (busyElsewhere(m)) throw new ApiError(409, '두 분 중 한 분이 이미 다른 매칭을 진행 중이에요. 반려해 주세요.', 'MATCH_BUSY');
  const t = nowIso();
  Object.assign(m, { status: 'ACCEPTED', acceptedAt: t, approvedAt: t, approvedBy: user.name, updatedAt: t, memo: '하트 맞교환 — 담당자 승인' });
  syncStatuses(m);
  closeOpenHearts([m.aId, m.bId]);
  for (const id of [m.aId, m.bId]) {
    db.messages.push({
      id: ++db.seq.message, thread: `A${id}`, fromId: null, fromAdmin: true, adminName: '사緣', toId: id, auto: true,
      body: '[매칭 안내] 서로 하트를 보낸 분과 매칭이 확정됐어요. 홈에서 상대를 확인하고 쪽지로 먼저 인사를 건네 보세요.',
      at: t, readAt: null, box: {},
    });
  }
  audit(user, 'MATCH_APPROVE', `매칭 #${m.id} ${tag(a)} ↔ ${tag(b)}`, '하트 맞교환 승인 → 양측 수락');
}
/** 승인 대기 → 반려. 두 분에게는 알리지 않는다 (매칭 대기 중으로 돌아가고, 서로는 다시 추천되지 않는다) */
function rejectPending(m, user, reason = '') {
  if (m.status !== PENDING_MATCH_STATUS) throw new ApiError(409, '승인 대기 중인 매칭이 아니에요. 새로고침해 주세요.', 'NOT_PENDING');
  const why = String(reason ?? '').trim().slice(0, 200);
  const t = nowIso();
  Object.assign(m, { status: 'REJECTED', rejectedAt: t, rejectedBy: user.name, updatedAt: t, memo: `하트 맞교환 — 반려${why ? `: ${why}` : ''}` });
  const a = db.applicants.find((x) => x.id === m.aId);
  const b = db.applicants.find((x) => x.id === m.bId);
  audit(user, 'MATCH_REJECT', `매칭 #${m.id} ${a ? tag(a) : '(탈퇴)'} ↔ ${b ? tag(b) : '(탈퇴)'}`, why || '사유 없음');
}

/** 마이페이지 한 번에 내려주는 정보 */
const partnerOf = (m, app) => db.applicants.find((x) => x.id === (m.aId === app.id ? m.bId : m.aId));
const myReview = (m, app) => db.reviews.find((r) => r.matchId === m.id && r.reviewerId === app.id);
const reviewView = (r) => r && { outcome: r.outcome, rating: r.rating, wantMore: r.wantMore, comment: r.comment, updatedAt: r.updatedAt };

/** 후기를 쓸(또는 고칠) 매칭: 진행 중 매칭, 없으면 최근 30일 안에 끝난 '서로 수락했던' 매칭 중 아직 후기를 안 쓴 것 */
function reviewTarget(app) {
  const mine = db.matches
    .filter((m) => (m.aId === app.id || m.bId === app.id) && m.acceptedAt && REVIEWABLE_MATCH_STATUS.includes(m.status))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const active = mine.find((m) => ACTIVE_MATCH_STATUS.includes(m.status));
  if (active) return active;
  const cutoff = Date.now() - REVIEW_WINDOW_DAYS * DAY;
  return mine.find((m) => Date.parse(m.createdAt) >= cutoff && !myReview(m, app)) ?? null;
}

/** 마이페이지 한 번에 내려주는 정보 */
function dashboardOf(app) {
  const status = userStatusOf(app);
  const out = { status, application: userView(app), daily: null, inbox: [], partner: null, review: null };

  const rm = reviewTarget(app);
  if (rm) {
    const p = partnerOf(rm, app);
    out.review = {
      matchId: rm.id,
      active: ACTIVE_MATCH_STATUS.includes(rm.status),
      partner: p ? { ...card(p, rm.score), since: rm.createdAt } : null,
      mine: reviewView(myReview(rm, app)),
    };
  }

  if (status === 'COUPLED') {
    out.review = null; // 커플 완료 뒤에는 후기를 묻지 않는다
    const m = db.matches.filter((x) => x.status === 'COUPLE' && (x.aId === app.id || x.bId === app.id)).at(-1);
    const p = m && partnerOf(m, app);
    out.couple = { since: m?.coupledAt ?? m?.updatedAt ?? null, partner: p ? card(p, m.score, app) : null };
    return out; // 커플 완료 — 새 후보·하트 없음
  }

  if (status === 'MATCHING') {
    const m = db.matches.find((x) => ACTIVE_MATCH_STATUS.includes(x.status) && (x.aId === app.id || x.bId === app.id));
    const p = m && partnerOf(m, app);
    if (p) out.partner = { ...card(p, m.score, app), since: m.createdAt, accepted: Boolean(m.acceptedAt), matchId: m.id };
    return out; // 매칭 중에는 새 후보·하트를 보여주지 않는다
  }

  expireHearts();
  const pendingHeart = db.hearts.find((h) => h.fromId === app.id && h.status === 'SENT');
  if (pendingHeart && !app.quick) {
    // 하트를 보낸 뒤에는 상대가 답하거나 만료될 때까지 다음 후보를 보여주지 않는다
    const t = db.applicants.find((x) => x.id === pendingHeart.toId);
    out.daily = {
      date: kstDate(), total: 0, index: 0, current: null, heartsLeft: 0, heartSentToday: true,
      pending: t ? { card: card(t, null, app), at: pendingHeart.at, expiresAt: new Date(Date.parse(pendingHeart.at) + HEART_TTL_MS).toISOString() } : null,
    };
  }

  // 보류(담당자)·스스로 쉬기·싫어요 제재·임시 신청 → 새 후보 없음. 제재 사실은 본인에게 알리지 않는다
  const gathering = Boolean(db.settings.holdUntilStart);
  const paused = app.status === 'HOLD' || isSanctioned(app) || isBlacklisted(app.empNo) || app.quick || gathering || Boolean(pendingMatchOf(app));
  const d = paused || out.daily ? null : ensureDaily(app);
  if (out.daily) {
    // 하트 응답 대기 중 (위에서 채움)
  } else if (d) {
    // 그새 다른 사람과 이어졌거나 탈퇴한 후보는 건너뛴다
    while (d.cursor < d.items.length && !isActiveCandidate(db.applicants.find((x) => x.id === d.items[d.cursor].id), app)) d.cursor++;
    const curItem = d.items[d.cursor];
    const c = curItem && db.applicants.find((x) => x.id === curItem.id);
    out.daily = {
      date: d.date,
      total: d.items.length,
      index: Math.min(d.cursor, d.items.length),
      current: c ? card(c, curItem.score, app) : null,
      heartsLeft: Math.max(0, DAILY_HEART_LIMIT - heartsSentToday(app)),
      heartSentToday: Boolean(d.heartTo),
    };
  } else {
    out.daily = {
      date: kstDate(), total: 0, index: 0, current: null, heartsLeft: 0, heartSentToday: false, paused: true,
      selfPaused: Boolean(app.selfPaused), quick: Boolean(app.quick), gathering,
      ...(app.quick && pendingHeart && { pendingQuick: true }),
    };
  }

  // 받은 하트도 수락하면 매칭이 생기므로, 하트를 주고받을 수 없는 상태(보류·쉬기·제재·블랙리스트·오픈 전)면 보여주지 않는다
  // (예전: 보이기는 하는데 수락하면 막히거나, 반대로 막아야 할 상태에서 매칭이 생겼다)
  const inboxOpen = !matchingBlockOf(app);
  out.inbox = (inboxOpen ? db.hearts : [])
    .filter((h) => h.toId === app.id && h.status === 'SENT')
    .map((h) => {
      const from = db.applicants.find((x) => x.id === h.fromId);
      if (!isActiveCandidate(from, app)) return null;
      const score = scoreCandidates(app, [from], db.matches, db.codes)[0]?.score ?? null;
      return { heartId: h.id, at: h.at, card: card(from, score, app) };
    })
    .filter(Boolean);
  return out;
}

function requireMyApp(user) {
  const app = myApplication(user);
  if (!app) throw new ApiError(404, '신청 내역이 없어요. 먼저 신청해 주세요.', 'NOT_FOUND');
  return app;
}

// ── 쪽지 ────────────────────────────────────────────────
/**
 * 쪽지 한 통 = { thread: 'A{신청자id}'(담당자) | 'M{매칭id}'(매칭 상대), fromId|fromAdmin, toId|toAdmin, body, at, readAt, box }
 * box[신청자id] = 'TRASH'(휴지통) | 'GONE'(영구 삭제) — 보낸 사람·받은 사람이 각자 따로 지운다
 */
const msgState = (m, app) => m.box?.[app.id] ?? null;
const isMineMsg = (m, app) => m.fromId === app.id || m.toId === app.id;
const matchOfThread = (key) => (key?.startsWith('M') ? db.matches.find((x) => x.id === Number(key.slice(1))) : null);
/** 매칭 상대에게 쪽지를 보낼 수 있는가: 서로 수락했고 아직 진행 중인 매칭 */
const matchSendable = (m) => Boolean(m && m.acceptedAt && ['ACCEPTED', 'MET'].includes(m.status));

function peerOf(key, app) {
  if (key.startsWith('A')) return { key, kind: 'ADMIN', name: '사緣 매칭 담당자', face: null };
  const m = matchOfThread(key);
  const p = m && partnerOf(m, app);
  return { key, kind: 'MATCH', name: p?.nickname ?? '(지난 상대)', face: p?.face ?? null };
}
/** 상대 답장 없이 내가 연달아 보낸 쪽지 수 */
function burstOf(key, app) {
  const list = db.messages.filter((m) => m.thread === key);
  let n = 0;
  for (let i = list.length - 1; i >= 0 && list[i].fromId === app.id; i--) n++;
  return n;
}
function msgView(m, app) {
  const out = m.fromId === app.id;
  return { id: m.id, dir: out ? 'OUT' : 'IN', auto: Boolean(m.auto), peer: peerOf(m.thread, app), body: m.body, preview: m.body.replace(/\s+/g, ' ').slice(0, 60), at: m.at, readAt: m.readAt, box: msgState(m, app) };
}
/** 지금 쪽지를 보낼 수 있는 받는 사람: 담당자(늘) + 진행 중인 매칭 상대 */
function recipientsOf(app) {
  const limit = db.settings.messageBurstLimit;
  const list = [{ ...peerOf(`A${app.id}`, app) }];
  for (const m of db.matches.filter((x) => (x.aId === app.id || x.bId === app.id) && matchSendable(x))) {
    if (partnerOf(m, app)) list.push(peerOf(`M${m.id}`, app));
  }
  return list.map((r) => ({ ...r, left: Math.max(0, limit - burstOf(r.key, app)), limit }));
}

/** 오늘의 사주 인연에게 하트 — 상대도 이미 하트를 보냈다면 바로 매칭 */
function sendSajuHeart(app) {
  const pick = db.sajuPicks[app.empNo];
  const target = pick?.date === kstDate() && db.applicants.find((a) => a.id === pick.id);
  if (!isActiveCandidate(target, app) || target.gender === app.gender) {
    throw new ApiError(409, '그새 이 분의 상황이 바뀌었어요. 사주 인연을 다시 찾아주세요.', 'CANDIDATE_GONE');
  }
  const t = nowIso();
  const reverse = db.hearts.find((h) => h.fromId === target.id && h.toId === app.id && h.status === 'SENT');
  db.hearts.push({ id: ++db.seq.heart, fromId: app.id, toId: target.id, status: reverse ? 'ACCEPTED' : 'SENT', at: t, answeredAt: reverse ? t : null, source: 'SAJU' });
  if (reverse) {
    Object.assign(reverse, { status: 'ACCEPTED', answeredAt: t });
    createHeartMatch(target, app, 90);
  }
  return { matched: false, to: target.nickname }; // 서로 하트여도 담당자 승인 전까지는 매칭이 아니다
}

// ── API ─────────────────────────────────────────────────
export const api = {
  auth: {
    /** 사내 계정(AD) ID 또는 사번 + 사내 계정 비밀번호 → 사내 인증(directory)이 확인한다 */
    async login(account, password) {
      await wait();
      const profile = await A.directory.authenticate(String(account ?? '').trim(), String(password ?? ''), db);
      if (!profile) throw new ApiError(401, '사내 계정 또는 비밀번호가 맞지 않아요. 다시 확인해 주세요.', 'BAD_CREDENTIALS');
      return startSession(profile);
    },

    /**
     * 사내 SSO — 로그인 화면 없이 요청 정보로 임직원을 확인한다 (운영은 이 방법으로만 들어온다)
     * @param {{ query?: Record<string,string> }} [hint] 주소창의 값 (SSO 로그인 페이지에서 돌아올 때 붙은 ticket 등)
     */
    async sso(hint = {}) {
      await wait();
      if (!A.directory.identify) throw new ApiError(501, '사내 SSO가 연결되지 않았어요.', 'SSO_DISABLED');
      const profile = await A.directory.identify(hint);
      if (!profile) throw new ApiError(401, '사내 인사정보로 임직원이 확인되지 않았어요.', 'SSO_FAILED');
      return startSession(profile);
    },

    /**
     * 개발 화면(npm run dev) 테스트 사번 로그인 — 사번이 테스트 목록(servers.config.mjs 의 devLogin)에 있어야 한다.
     * 개발 PC · 개발 키 확인은 서버 경로(routes/auth.js)가 먼저 한다
     */
    async devLogin(empNo) {
      await wait();
      const acct = (A.devAccounts?.() ?? []).find((a) => a.empNo === String(empNo ?? ''));
      if (!acct) throw new ApiError(403, '등록된 테스트 사번이 아니에요.', 'DEV_LOGIN_DENIED');
      return startSession({ adId: acct.empNo, ...acct, active: true, test: true });
    },
    /** 개발 화면의 테스트 사번 목록 */
    async devAccounts() {
      await wait();
      return (A.devAccounts?.() ?? []).map(({ empNo, name, gender, division, team }) => ({ empNo, name, gender, division, team }));
    },

    async me() {
      await wait();
      const user = requireUser();
      const s = getSession();
      return { user: publicUser(user), adminExpiresAt: s.adminExpiresAt > Date.now() && canEnterAdmin(user) ? s.adminExpiresAt : 0 };
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

    /**
     * 관리자 모드 진입 — 관리자 계정(admin.isAdmin)이고 관리자 비밀번호(admin.verify)가 맞아야 한다.
     * 실패 횟수는 세션이 아니라 사번 기준으로 센다 (쿠키를 지워도 잠금이 풀리지 않게)
     */
    async enterAdmin(password) {
      await wait();
      const user = requireUser();
      const s = getSession();
      // 비밀번호가 아직 없으면 '틀렸다'로 잠그지 않고 설정이 필요하다고 알린다
      if (A.admin.passwordSet && !A.admin.passwordSet()) {
        throw new ApiError(503, '관리자 비밀번호가 아직 설정되지 않았어요. API 서버의 config/admins.js 를 확인해 주세요.', 'ADMIN_NOT_CONFIGURED');
      }
      if (!canEnterAdmin(user)) {
        audit(user, 'ADMIN_ENTER_FAIL', '', '관리자 계정 아님');
        commit();
        throw new ApiError(403, '관리자로 등록된 계정이 아니에요. 매칭 담당자에게 문의해 주세요.', 'NOT_ADMIN');
      }
      const lock = db.adminLocks[user.empNo] ?? { fails: 0, lockedUntil: 0 };
      if (lock.lockedUntil > Date.now()) {
        const min = Math.ceil((lock.lockedUntil - Date.now()) / 60000);
        throw new ApiError(423, `비밀번호를 여러 번 틀려 관리자 인증이 잠겼어요. ${min}분 뒤에 다시 시도해 주세요.`, 'ADMIN_LOCKED');
      }
      if (!(await A.admin.verify(String(password ?? ''), user))) {
        const fails = (lock.fails ?? 0) + 1;
        audit(user, 'ADMIN_ENTER_FAIL', '', `${fails}회째 실패`);
        if (fails >= ADMIN_MAX_FAILS) {
          db.adminLocks[user.empNo] = { fails: 0, lockedUntil: Date.now() + ADMIN_LOCK_MS };
          commit();
          throw new ApiError(423, `비밀번호를 ${ADMIN_MAX_FAILS}번 틀려 ${ADMIN_LOCK_MINUTES}분 동안 관리자 인증이 잠겼어요.`, 'ADMIN_LOCKED');
        }
        db.adminLocks[user.empNo] = { fails, lockedUntil: 0 };
        commit();
        throw new ApiError(401, `관리자 비밀번호가 맞지 않아요. (남은 시도 ${ADMIN_MAX_FAILS - fails}회)`, 'ADMIN_BAD_PASSWORD');
      }
      delete db.adminLocks[user.empNo];
      const adminExpiresAt = Date.now() + ADMIN_IDLE_MS;
      setSession({ ...s, adminExpiresAt });
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

  codes: {
    /** 기준정보 전체 (로그인한 임직원 누구나) */
    async list() {
      await wait();
      requireUser();
      return clone(db.codes);
    },
  },

  application: {
    async getMine() {
      await wait();
      const app = myApplication(requireUser());
      return app ? userView(app) : null;
    },

    async create(data) {
      await wait();
      const user = requireUser();
      if (myApplication(user)) {
        throw new ApiError(409, '이미 신청서를 냈어요. 마이페이지에서 수정할 수 있어요.', 'ALREADY_APPLIED');
      }
      if (isBlacklisted(user.empNo)) throw new ApiError(403, '지금은 사緣에 신청할 수 없는 계정이에요.', 'BLACKLISTED');
      const fields = { ...pickFields(data, APP_FIELDS), name: user.name }; // 이름 = 인사정보
      if (fields.nickname && nicknameTaken(fields.nickname)) throw new ApiError(409, `'${fields.nickname}'은(는) 이미 누군가 쓰고 있어요. 다른 닉네임을 골라주세요.`, 'NICKNAME_TAKEN');
      const errors = validateApplication(fields, db.codes);
      if (errors.length) throw new ApiError(400, `입력값을 확인해 주세요: ${errors.join(', ')}`, 'VALIDATION');
      const t = nowIso();
      const penalty = db.penalties[user.empNo]?.count ?? 0; // 탈퇴 전 받은 싫어요 횟수 이어받기
      const app = {
        id: ++db.seq.applicant, empNo: user.empNo, ...fields, ...(user.test && { test: true }),
        status: 'RECEIVED', adminMemo: '', agreedAt: t, createdAt: t, updatedAt: t, ...(penalty && { penalty }),
      };
      db.applicants.push(app);
      commit();
      return userView(app);
    },

    async update(data) {
      await wait();
      const user = requireUser();
      const app = requireMyApp(user);
      const lock = lockReasonOf(app);
      if (lock === 'MATCHING') throw new ApiError(409, '매칭이 진행 중이라 신청서를 고칠 수 없어요. 매칭 대기 중으로 바뀌면 다시 고칠 수 있어요.', 'EDIT_LOCKED');
      if (lock === 'HEART') throw new ApiError(409, '보낸 하트에 답을 기다리는 동안에는 신청서를 고칠 수 없어요.', 'EDIT_LOCKED');
      if (lock === 'COUPLED') throw new ApiError(409, '커플 완료 상태예요. 다시 인연 찾기를 누르면 고칠 수 있어요.', 'EDIT_LOCKED');
      const fields = { ...pickFields(data, APP_FIELDS), name: user.name };
      if (fields.nickname && nicknameTaken(fields.nickname, app.id)) throw new ApiError(409, `'${fields.nickname}'은(는) 이미 누군가 쓰고 있어요. 다른 닉네임을 골라주세요.`, 'NICKNAME_TAKEN');
      const errors = validateApplication(fields, db.codes, { previous: app });
      if (errors.length) throw new ApiError(400, `입력값을 확인해 주세요: ${errors.join(', ')}`, 'VALIDATION');
      // 성별이 바뀌면 이전 성별 기준의 하트·오늘의 후보·본 기록을 모두 지우고 새로 시작한다
      const genderChanged = fields.gender && fields.gender !== app.gender;
      Object.assign(app, fields, { updatedAt: nowIso(), quick: false });
      if (!app.agreeSensitive) Object.assign(app, { religion: null, prefReligions: [] });
      if (genderChanged) {
        db.hearts = db.hearts.filter((h) => h.fromId !== app.id && h.toId !== app.id);
        delete db.daily[app.id];
        delete db.seen[app.id];
        for (const d of Object.values(db.daily)) {
          // 다른 사람 오늘의 후보에서도 뺀다. 이미 지나간 자리에서 빠지면 커서도 한 칸 당겨야
          // 다음 후보를 건너뛰지 않는다 (예전: 지금 보던 후보 다음 사람이 한 명 사라졌다)
          const idx = d.items.findIndex((it) => it.id === app.id);
          if (idx < 0) continue;
          d.items.splice(idx, 1);
          if (idx < d.cursor) d.cursor -= 1;
          if (d.cursor > d.items.length) d.cursor = d.items.length;
        }
      }
      // 오늘 이미 정해진 후보는 그대로 두고, 바뀐 선호는 내일 후보부터 반영한다 (수정으로 후보를 다시 뽑는 것 방지)
      commit();
      return userView(app);
    },

    /** 쓰지 않은 닉네임 추천 (10,000개 조합 중) */
    async suggestNicknames(count = 4) {
      await wait();
      requireUser();
      return suggestNicknames(Math.min(Number(count) || 4, 10), new Set(db.applicants.map((a) => a.nickname)));
    },

    async withdraw() {
      await wait();
      const app = myApplication(requireUser());
      if (app) removeApplicant(app); // 즉시 완전 삭제 (복구 불가)
      commit();
      return null;
    },
  },

  /** 마이페이지: 상태 · 오늘의 후보 · 받은 하트 */
  me: {
    async dashboard() {
      await wait();
      const app = requireMyApp(requireUser());
      const out = dashboardOf(app);
      commit();
      return out;
    },

    /** 지금 카드를 넘긴다 — 넘긴 상대는 다시 고를 수 없다 */
    async pass() {
      await wait();
      const app = requireMyApp(requireUser());
      assertCanMatch(app);
      if (app.quick) throw new ApiError(409, '신청서를 마저 쓰면 오늘의 인연이 열려요.', 'QUICK');
      expireHearts();
      if (db.hearts.some((h) => h.fromId === app.id && h.status === 'SENT')) throw new ApiError(409, '보낸 하트에 답이 올 때까지 다음 후보를 볼 수 없어요.', 'HEART_PENDING');
      const d = ensureDaily(app);
      if (d.cursor < d.items.length) d.cursor++;
      commit();
      return dashboardOf(app);
    },

    /** 지금 카드에 하트 — 하루 1개. 상대도 이미 나에게 하트를 보냈다면 바로 이어진다 */
    async heart() {
      await wait();
      const app = requireMyApp(requireUser());
      assertCanMatch(app);
      if (app.quick) throw new ApiError(409, '신청서를 마저 쓰면 오늘의 인연이 열려요.', 'QUICK');
      expireHearts();
      if (db.hearts.some((h) => h.fromId === app.id && h.status === 'SENT')) throw new ApiError(409, '보낸 하트에 답이 올 때까지 기다려 주세요.', 'HEART_PENDING');
      if (heartsSentToday(app) >= DAILY_HEART_LIMIT) {
        throw new ApiError(429, '하트는 하루에 1개만 보낼 수 있어요. 내일 다시 만나요.', 'HEART_LIMIT');
      }
      const d = ensureDaily(app);
      const item = d.items[d.cursor];
      const target = item && db.applicants.find((x) => x.id === item.id);
      if (!isActiveCandidate(target, app)) {
        if (item) d.cursor++;
        commit();
        throw new ApiError(409, '이 후보와는 지금 이어질 수 없어요. 다음 후보를 확인해 주세요.', 'CANDIDATE_GONE');
      }
      const t = nowIso();
      const reverse = db.hearts.find((h) => h.fromId === target.id && h.toId === app.id && h.status === 'SENT');
      const heart = { id: ++db.seq.heart, fromId: app.id, toId: target.id, status: reverse ? 'ACCEPTED' : 'SENT', at: t, answeredAt: reverse ? t : null };
      db.hearts.push(heart);
      if (reverse) {
        Object.assign(reverse, { status: 'ACCEPTED', answeredAt: t });
        createHeartMatch(target, app, item.score);
      }
      d.heartTo = target.id;
      d.cursor++;
      commit();
      return { ...dashboardOf(app), matched: false }; // 서로 하트면 승인 대기 — 본인에게는 알리지 않는다
    },

    /** 받은 하트에 응답 — 수락하면 바로 '매칭 중', 거절은 상대에게 알리지 않는다 */
    async answerHeart(heartId, accept) {
      await wait();
      const app = requireMyApp(requireUser());
      const h = db.hearts.find((x) => x.id === Number(heartId) && x.toId === app.id && x.status === 'SENT');
      if (!h) throw new ApiError(404, '이미 응답했거나 사라진 하트예요.', 'NOT_FOUND');
      const from = db.applicants.find((x) => x.id === h.fromId);
      // 수락은 새 매칭을 만드는 일이라 하트 보내기와 같은 조건을 본다 (커플 완료·블랙리스트·제재·오픈 전 멈춤)
      // 매칭 중이면 아래에서 기존 규칙대로 하트를 만료시킨다
      if (accept && matchingBlockOf(app) && matchingBlockOf(app) !== 'MATCHING') assertCanMatch(app);
      h.answeredAt = nowIso();
      if (!accept) {
        h.status = 'DECLINED';
        commit();
        return { ...dashboardOf(app), matched: false };
      }
      if (userStatusOf(app) === 'MATCHING' || !isActiveCandidate(from, app)) {
        h.status = 'EXPIRED';
        commit();
        throw new ApiError(409, '아쉽지만 지금은 이 분과 이어질 수 없어요.', 'CANDIDATE_GONE');
      }
      h.status = 'ACCEPTED';
      const score = scoreCandidates(app, [from], db.matches, db.codes)[0]?.score ?? 0;
      createHeartMatch(from, app, score); // 승인 대기
      commit();
      return { ...dashboardOf(app), matched: false };
    },

    /**
     * 매칭 후기 — 만남 결과 · 상대 평가(좋아요/싫어요) · 추가 매칭 원함 · 담당자에게 코멘트
     *  - 상대 평가와 코멘트는 담당자만 본다 (상대에게 절대 보이지 않음)
     *  - 못 만났거나(노쇼 등) 추가 매칭을 원하면 이 매칭을 끝내고 두 사람 모두 '매칭 대기 중'으로 돌아간다
     *  - 만났고 추가 매칭을 원하지 않으면 매칭을 유지한다(커플). 나중에 '추가 매칭 요청'으로 다시 열 수 있다
     *  - 못 만났는데 추가 매칭도 원하지 않으면 매칭을 끝내고 내 매칭을 쉬게 한다(다시 받기 가능)
     */
    async submitReview({ outcome, rating, wantMore, comment = '', couple = false }) {
      await wait();
      const app = requireMyApp(requireUser());
      const m = reviewTarget(app);
      if (!m) throw new ApiError(404, '후기를 남길 매칭이 없어요.', 'NOT_FOUND');
      if (!m.acceptedAt) throw new ApiError(409, '아직 두 분이 서로 수락하기 전이라 후기를 남길 수 없어요.', 'NOT_ACCEPTED');
      if (!REVIEW_OUTCOMES.some((o) => o.value === outcome)) throw new ApiError(400, '만남 결과를 골라주세요.', 'VALIDATION');
      if (!REVIEW_RATINGS.some((o) => o.value === rating)) throw new ApiError(400, '상대 평가를 골라주세요.', 'VALIDATION');
      if (typeof wantMore !== 'boolean') throw new ApiError(400, '추가 매칭 여부를 골라주세요.', 'VALIDATION');
      const text = String(comment ?? '').trim();
      if (text.length > 300) throw new ApiError(400, '코멘트는 300자까지 적을 수 있어요.', 'VALIDATION');
      // 검증은 저장 전에 모두 끝낸다 (예전: 후기를 먼저 고친 뒤 이 검사에서 실패해 잘못된 후기가 남았다)
      if (couple && outcome !== 'MET') throw new ApiError(400, "커플 완료는 '만났어요'를 고른 경우에만 할 수 있어요.", 'VALIDATION');

      const t = nowIso();
      const partner = partnerOf(m, app);
      let r = myReview(m, app);
      if (r) Object.assign(r, { outcome, rating, wantMore, comment: text, updatedAt: t });
      else {
        r = { id: ++db.seq.review, matchId: m.id, reviewerId: app.id, targetId: partner?.id ?? null, outcome, rating, wantMore, comment: text, createdAt: t, updatedAt: t };
        db.reviews.push(r);
      }

      if (couple && ACTIVE_MATCH_STATUS.includes(m.status) && m.status !== 'PROPOSED') {
        Object.assign(m, { status: 'COUPLE', coupledAt: t, coupledBy: app.id, updatedAt: t });
        syncStatuses(m);
      } else if (ACTIVE_MATCH_STATUS.includes(m.status)) {
        const before = m.status;
        if (outcome !== 'MET') m.status = 'DECLINED';
        else if (wantMore) m.status = 'CLOSED';
        else m.status = 'MET';
        m.updatedAt = t;
        if (before !== m.status) syncStatuses(m);
      }
      if (outcome !== 'MET' && !wantMore) Object.assign(app, { status: 'HOLD', selfPaused: true, updatedAt: t });
      commit();
      return dashboardOf(app);
    },

    /** 커플 최종 완료 — 서로 수락한 매칭을 '커플 성사'로 마무리한다. 두 사람 모두 새 후보·하트를 받지 않는다 */
    async completeCouple() {
      await wait();
      const app = requireMyApp(requireUser());
      const m = db.matches.find((x) => ['ACCEPTED', 'MET'].includes(x.status) && (x.aId === app.id || x.bId === app.id));
      if (!m) throw new ApiError(409, '서로 수락한 매칭이 있을 때만 커플 완료를 할 수 있어요.', 'NOT_MATCHED');
      const t = nowIso();
      Object.assign(m, { status: 'COUPLE', coupledAt: t, coupledBy: app.id, updatedAt: t });
      syncStatuses(m);
      commit();
      return dashboardOf(app);
    },

    /**
     * 다시 매칭 받기
     *  - 스스로 쉬던 경우: 매칭 대기 중으로 돌아간다
     *  - 커플 완료 상태에서 '다시 인연 찾기': 커플 매칭을 끝내 두 사람 모두 커플 상태를 풀고,
     *    상대에게 '다시 인연 찾기를 선택했다'는 자동 안내 쪽지를 보낸다 (끝난 매칭이라 상대는 답장할 수 없다)
     */
    async resume() {
      await wait();
      const app = requireMyApp(requireUser());
      const t = nowIso();
      if (app.status === 'COUPLED') {
        const m = db.matches.filter((x) => x.status === 'COUPLE' && (x.aId === app.id || x.bId === app.id)).at(-1);
        if (m) {
          const partner = partnerOf(m, app);
          Object.assign(m, { status: 'CLOSED', closedAt: t, closedBy: app.id, updatedAt: t, memo: [m.memo, '커플 해제(다시 인연 찾기)'].filter(Boolean).join(' · ') });
          syncStatuses(m); // 두 사람 모두 '커플 성사' → '매칭 대기 중'
          if (partner) {
            db.messages.push({
              id: ++db.seq.message, thread: `M${m.id}`, fromId: app.id, toId: partner.id, auto: true,
              body: `[자동 안내] ${app.nickname}님이 '다시 인연 찾기'를 선택했어요. 두 분의 커플 상태가 종료되고, 각자 매칭 대기 중으로 돌아가요. 함께한 시간 고마웠어요.`,
              at: t, readAt: null, box: {},
            });
          }
        }
        Object.assign(app, { status: 'REVIEWING', selfPaused: false, updatedAt: t });
      } else if (app.selfPaused) {
        Object.assign(app, { status: 'REVIEWING', selfPaused: false, updatedAt: t });
      }
      commit();
      return dashboardOf(app);
    },
  },

  /** '곧 매칭이 시작돼요' 팝업 — 관리자 설정으로 켜고 끈다. 참여 인원 등 숫자는 주지 않는다 */
  stats: {
    async gathering() {
      await wait();
      requireUser();
      return { show: Boolean(db.settings.gatheringPopup), hold: Boolean(db.settings.holdUntilStart) };
    },
  },

  /**
   * 쪽지함 — 받은 쪽지함 / 보낸 쪽지함 / 휴지통 (대화형 채팅이 아님)
   *  - 매칭(서로 수락) 중인 상대와만 주고받고, 매칭이 끝나면 새로 보낼 수 없다(받은 쪽지는 그대로 볼 수 있음)
   *  - 담당자에게는 언제든 보낼 수 있다
   *  - 상대가 답하기 전에는 연속 N통(설정, 기본 3)까지만 보낼 수 있다
   *  - 매칭 담당자는 운영(신고 대응) 목적으로 쪽지를 열람할 수 있고, 열람하면 기록이 남는다
   */
  messages: {
    async box(name = 'inbox') {
      await wait();
      const app = requireMyApp(requireUser());
      const list = db.messages.filter((m) => isMineMsg(m, app) || (m.toAdmin && m.fromId === app.id));
      const pick = {
        inbox: (m) => m.toId === app.id && !msgState(m, app),
        sent: (m) => m.fromId === app.id && !msgState(m, app),
        trash: (m) => msgState(m, app) === 'TRASH',
      }[name];
      if (!pick) throw new ApiError(400, '알 수 없는 쪽지함이에요.', 'VALIDATION');
      return list.filter(pick).sort((x, y) => y.at.localeCompare(x.at)).map((m) => msgView(m, app));
    },
    async counts() {
      await wait();
      const app = requireMyApp(requireUser());
      const mine = db.messages.filter((m) => m.fromId === app.id || m.toId === app.id);
      return {
        inbox: mine.filter((m) => m.toId === app.id && !msgState(m, app)).length,
        unread: mine.filter((m) => m.toId === app.id && !m.readAt && !msgState(m, app)).length,
        sent: mine.filter((m) => m.fromId === app.id && !msgState(m, app)).length,
        trash: mine.filter((m) => msgState(m, app) === 'TRASH').length,
      };
    },
    async read(id) {
      await wait();
      const app = requireMyApp(requireUser());
      const m = db.messages.find((x) => x.id === Number(id) && (x.fromId === app.id || x.toId === app.id) && msgState(x, app) !== 'GONE');
      if (!m) throw new ApiError(404, '쪽지를 찾을 수 없어요.', 'NOT_FOUND');
      if (m.toId === app.id && !m.readAt) m.readAt = nowIso();
      commit();
      const r = recipientsOf(app).find((x) => x.key === m.thread);
      return { ...msgView(m, app), replyTo: r ?? null, closedReason: r ? '' : '매칭이 끝나 이 상대에게는 더 이상 쪽지를 보낼 수 없어요.' };
    },
    async recipients() {
      await wait();
      return recipientsOf(requireMyApp(requireUser()));
    },
    async send(to, body) {
      await wait();
      const app = requireMyApp(requireUser());
      const r = recipientsOf(app).find((x) => x.key === to);
      if (!r) throw new ApiError(403, '매칭이 이어지는 동안에만 상대에게 쪽지를 보낼 수 있어요.', 'MESSAGE_CLOSED');
      if (r.left <= 0) throw new ApiError(429, `상대가 답하기 전에는 연속 ${r.limit}통까지만 보낼 수 있어요. 답장을 기다려 주세요.`, 'MESSAGE_BURST');
      const text = String(body ?? '').trim();
      if (!text || text.length > 500) throw new ApiError(400, '쪽지는 1~500자로 적어주세요.', 'VALIDATION');
      const m = matchOfThread(to);
      const toId = m ? (m.aId === app.id ? m.bId : m.aId) : null;
      db.messages.push({ id: (db.seq.message = (db.seq.message ?? 0) + 1), thread: to, fromId: app.id, toId, toAdmin: !m, body: text, at: nowIso(), readAt: null, box: {} });
      commit();
      return { left: r.left - 1 };
    },
    /** 휴지통으로 / 되살리기 / 영구 삭제 — 내 쪽지함에서만 사라지고 상대 쪽지함에는 남는다 */
    async move(ids, to) {
      await wait();
      const app = requireMyApp(requireUser());
      const state = { trash: 'TRASH', restore: null, delete: 'GONE' }[to];
      if (state === undefined) throw new ApiError(400, '알 수 없는 동작이에요.', 'VALIDATION');
      for (const id of ids ?? []) {
        const m = db.messages.find((x) => x.id === Number(id) && (x.fromId === app.id || x.toId === app.id));
        if (!m) continue;
        m.box = { ...(m.box ?? {}) };
        if (state) m.box[app.id] = state;
        else delete m.box[app.id];
      }
      commit();
      return null;
    },
    async unread() {
      const app = myApplication(requireUser());
      if (!app) return 0;
      return db.messages.filter((m) => m.toId === app.id && !m.readAt && !msgState(m, app)).length;
    },
  },

  /**
   * 사주로 찾은 인연 — 사주 궁합이 가장 좋은 대기자 1명을 보여주고 하트로 바로 잇는다
   *  - 대상: 매칭 대기 중(제재·블랙리스트·임시 신청 제외), 다른 성별, 같은 팀 아님
   *  - 같은 날에는 같은 사람을 보여준다. 표시 점수는 마케팅 연출로 90점대 이상으로 올려 보여준다(오락용 표기)
   *  - 신청 전: 하트 팝업에서 필수 항목만 채우면 신청 + 하트가 한 번에 처리된다(apply)
   *  - 신청 후: 바로 하트(heart) — 오늘의 하트 1개를 쓰고, 답이 올 때까지 신청서 수정·새 후보가 잠긴다
   */
  saju: {
    async pick({ birthDate, birthTime = null, gender: picked = null }) {
      await wait();
      const user = requireUser();
      if (isBlacklisted(user.empNo)) return { blocked: true, card: null };
      const mine = myApplication(user);
      // 오픈 전 매칭 멈춤이면 사주 인연도 열지 않는다 (예전: 오늘의 인연만 멈추고 사주 하트로는 매칭이 생겼다)
      if (db.settings.holdUntilStart) return { applied: Boolean(mine), state: 'GATHERING', card: null };
      if (mine) {
        const st = userStatusOf(mine);
        if (st !== 'WAITING') return { applied: true, state: st, card: null };
        if (matchingBlockOf(mine) === 'PAUSED') return { applied: true, state: 'PAUSED', card: null }; // 하트를 못 보낼 사람에게 후보부터 보여주지 않는다
        if (pendingHeartOf(mine)) return { applied: true, state: 'HEART_PENDING', card: null };
        if (heartsSentToday(mine) >= DAILY_HEART_LIMIT) return { applied: true, state: 'HEART_LIMIT', card: null };
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(birthDate ?? '')) throw new ApiError(400, '생년월일을 확인해 주세요.', 'VALIDATION');
      // 신청서의 성별 → (신청 전) 사주 화면에서 고른 성별 → 인사정보 성별
      const gender = mine?.gender ?? (GENDERS.some((g) => g.value === picked) ? picked : null) ?? user.gender;
      // 성별을 모르면 같은 성별을 추천할 수 있으므로 찾지 않는다
      if (!gender) return { applied: Boolean(mine), state: 'NEED_GENDER', card: null };
      const me = { birthDate, birthTime, hobbies: [], gender, division: user.division, team: user.team };
      const busy = busyIds(db.matches);
      const already = new Set(mine ? db.hearts.filter((h) => h.fromId === mine.id).map((h) => h.toId) : []);
      const pool = recommendPool(user).filter(
        (c) => c.gender !== gender && c.empNo !== user.empNo && RECOMMENDABLE_STATUS.includes(c.status) && !busy.has(c.id) && !already.has(c.id)
          && !(c.division === user.division && c.team.replace(/\s/g, '') === user.team.replace(/\s/g, '')),
      );
      if (!pool.length) return { applied: Boolean(mine), card: null };
      const today = kstDate();
      const prev = db.sajuPicks[user.empNo];
      // 같은 날에는 같은 사람 (입력한 생년월일은 저장하지 않으므로 날짜만 본다)
      let target = prev?.date === today ? pool.find((c) => c.id === prev.id) : null;
      let real;
      if (!target) {
        const scored = pool.map((c) => ({ c, g: safeGunghap(me, c) })).filter((x) => x.g).sort((x, y) => y.g.score - x.g.score);
        if (!scored.length) return { applied: Boolean(mine), card: null }; // 궁합 계산이 모두 실패한 경우
        target = scored[0].c;
        real = scored[0].g;
      } else real = safeGunghap(me, target);
      db.sajuPicks[user.empNo] = { date: today, id: target.id }; // 생년월일·시간은 저장하지 않는다
      commit();
      // 연출: '무조건 높게' — 실제 궁합 점수와 90~97점 중 큰 값
      const shown = Math.max(real.score, 90 + (target.id * 7 + Number(birthDate.slice(-2))) % 8);
      const c = card(target, shown, null);
      return {
        applied: Boolean(mine),
        card: {
          ...c,
          gunghap: { ...real, score: shown, title: real.score >= 85 ? real.title : `${real.title}, 그리고 운명의 끌림` },
          story: { note: '사주가 가리킨 단 한 사람이에요', points: real.points },
        },
      };
    },

    /** 신청 전: 하트 팝업의 필수 항목으로 신청서를 만들고 오늘의 사주 인연에게 하트를 보낸다 */
    async apply(data) {
      const user = requireUser();
      if (db.settings.holdUntilStart) throw new ApiError(...BLOCK_ERRORS.GATHERING);
      const pick = db.sajuPicks[user.empNo];
      const target = pick?.date === kstDate() && db.applicants.find((a) => a.id === pick.id);
      // 하트를 보낼 수 없는 상대면 신청서를 만들기 전에 멈춘다
      // (예전: 신청서만 만들어지고 하트는 실패 → 다시 누르면 '이미 신청함'으로 막혔다)
      const gender = data?.gender ?? user.gender;
      if (!isActiveCandidate(target, user) || target.gender === gender) {
        throw new ApiError(409, '그새 이 분의 상황이 바뀌었어요. 사주 인연을 다시 찾아주세요.', 'CANDIDATE_GONE');
      }
      const created = await api.application.create(data); // 검증·블랙리스트·중복 신청 확인 포함
      const app = db.applicants.find((a) => a.id === created.id);
      // 정규 신청과 같은 신청서(4페이지)로 받으므로 임시 신청(quick)이 아니다 — 바로 오늘의 인연도 열린다
      // (예전 간편 팝업으로 만든 quick 신청서는 신청서를 저장하면 풀린다)
      try {
        return { ...sendSajuHeart(app), nickname: app.nickname };
      } finally {
        commit();
      }
    },

    /** 신청 후: 오늘의 사주 인연에게 바로 하트 */
    async heart() {
      await wait();
      const app = requireMyApp(requireUser());
      assertCanMatch(app); // 매칭 중·커플·블랙리스트·보류·제재·오픈 전 멈춤
      if (pendingHeartOf(app)) throw new ApiError(409, '보낸 하트에 답이 올 때까지 기다려 주세요.', 'HEART_PENDING');
      if (heartsSentToday(app) >= DAILY_HEART_LIMIT) throw new ApiError(429, '하트는 하루에 1개만 보낼 수 있어요. 내일 다시 만나요.', 'HEART_LIMIT');
      const r = sendSajuHeart(app);
      commit();
      return { ...r, nickname: app.nickname };
    },
  },

  /** 시스템 개선의 소리(VOC) — 내용은 담당자(관리자)만 본다. 작성자는 자기 글만 다시 볼 수 있다 */
  voc: {
    async create({ category, title, content }) {
      await wait();
      const user = requireUser();
      if (!VOC_CATEGORIES.some((c) => c.value === category)) throw new ApiError(400, '분류를 골라주세요.', 'VALIDATION');
      const tt = String(title ?? '').trim();
      const ct = String(content ?? '').trim();
      if (tt.length < 2 || tt.length > 60) throw new ApiError(400, '제목을 2~60자로 적어주세요.', 'VALIDATION');
      if (ct.length < 10 || ct.length > 1000) throw new ApiError(400, '내용을 10~1000자로 적어주세요.', 'VALIDATION');
      const t = nowIso();
      const v = {
        id: ++db.seq.voc, category, title: tt, content: ct, anonymous: false, // 익명 옵션 없음 (요청에 따라 실명만)
        // 서버 구현: 익명이면 사번 대신 솔트 해시만 저장해 '내 글 보기'에만 쓴다
        ownerEmpNo: user.empNo,
        author: `${user.name} · ${user.team}`, // 관리자에게 이름·팀 표시
        status: 'RECEIVED', reply: '', createdAt: t, updatedAt: t,
      };
      db.vocs.unshift(v);
      commit();
      return clone(v);
    },

    async listMine() {
      await wait();
      const user = requireUser();
      return db.vocs.filter((v) => v.ownerEmpNo === user.empNo).map(({ ownerEmpNo, ...v }) => clone(v));
    },
  },

  admin: {
    async stats() {
      await wait();
      requireAdmin();
      const apps = db.applicants.filter((a) => !a.test); // 개발 테스트 신청서는 통계에서 뺀다
      const weekAgo = Date.now() - 7 * DAY;
      const today = kstDate();
      return {
        total: apps.length,
        weekNew: apps.filter((a) => Date.parse(a.createdAt) >= weekAgo).length,
        male: apps.filter((a) => a.gender === 'M').length,
        female: apps.filter((a) => a.gender === 'F').length,
        proposing: db.matches.filter((m) => m.status === 'PROPOSED').length,
        pendingMatches: db.matches.filter((m) => m.status === PENDING_MATCH_STATUS).length,
        couples: db.matches.filter((m) => m.status === 'ACCEPTED' || m.status === 'MET').length,
        coupled: db.matches.filter((m) => m.status === 'COUPLE').length,
        blacklisted: db.blacklist.length,
        heartsToday: db.hearts.filter((h) => kstDate(Date.parse(h.at)) === today).length,
        heartsPending: db.hearts.filter((h) => h.status === 'SENT').length,
        heartMatches: db.matches.filter((m) => m.source === 'HEART').length,
        byStatus: APPLY_STATUS.map((s) => ({ status: s.value, text: s.text, count: apps.filter((a) => a.status === s.value).length })),
        byDivision: [...db.codes.DIVISION].sort((a, b) => a.order - b.order).map((d) => {
          const n = apps.filter((a) => a.division === d.value).length;
          return {
            division: d.text,
            male: apps.filter((a) => a.division === d.value && a.gender === 'M').length,
            female: apps.filter((a) => a.division === d.value && a.gender === 'F').length,
            count: n,
            ratio: apps.length ? Math.round((n / apps.length) * 1000) / 10 : 0, // 신청 비율(%) 소수 1자리
          };
        }),
        sanctioned: apps.filter(isSanctioned).length,
        reviews: db.reviews.length,
        vocOpen: db.vocs.filter((v) => v.status === 'RECEIVED' || v.status === 'REVIEWING').length,
        settings: { ...db.settings },
        recent: [...apps]
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
          .slice(0, 6)
          .map((a) => ({ id: a.id, name: a.name, gender: a.gender, age: ageOf(a.birthYear), division: a.division, status: a.status, createdAt: a.createdAt })),
      };
    },

    /** 관리자 화면은 이름 전체를 보여준다 (신청자 화면·후보 카드는 초성) */
    async listApplicants() {
      await wait();
      requireAdmin();
      const busy = busyIds(db.matches);
      return db.applicants.map((a) => ({
        id: a.id, empNo: a.empNo, name: a.name, nickname: a.nickname, serious: a.serious,
        dislikes: dislikesOf(a), sanctioned: isSanctioned(a), blacklisted: isBlacklisted(a.empNo), gender: a.gender, birthYear: a.birthYear, age: ageOf(a.birthYear),
        division: a.division, team: a.team, campus: a.campus, building: a.building, mbti: a.mbti, face: a.face, looks: a.looks,
        heightBand: a.heightBand, status: a.status, userStatus: userStatusOf(a), busy: busy.has(a.id),
        heartsIn: db.hearts.filter((h) => h.toId === a.id).length, heartsOut: db.hearts.filter((h) => h.fromId === a.id).length,
        hasMemo: Boolean(a.adminMemo), createdAt: a.createdAt, updatedAt: a.updatedAt, test: Boolean(a.test),
        matchState: matchStateOf(a),
      }));
    },

    async getApplicant(id) {
      await wait();
      const user = requireAdmin();
      const a = findApplicant(id);
      audit(user, 'VIEW_APPLICANT', tag(a));
      commit();
      return { ...withAge(a), userStatus: userStatusOf(a), dislikes: dislikesOf(a), sanctioned: isSanctioned(a) };
    },

    async updateApplicant(id, data) {
      await wait();
      const user = requireAdmin();
      const a = findApplicant(id);
      const changes = pickFields(data, ADMIN_EDITABLE); // 이름은 인사정보 값이라 관리자도 고치지 않는다
      const merged = { ...a, ...changes };
      if (changes.nickname && nicknameTaken(changes.nickname, a.id)) throw new ApiError(409, '이미 쓰는 닉네임이에요.', 'NICKNAME_TAKEN');
      const errors = validateApplication(merged, db.codes, { requireConsent: false, previous: a });
      if (errors.length) throw new ApiError(400, `입력값을 확인해 주세요: ${errors.join(', ')}`, 'VALIDATION');
      if (changes.status && !APPLY_STATUS_MAP[changes.status]) throw new ApiError(400, '알 수 없는 상태예요.', 'VALIDATION');
      if (changes.status && changes.status !== a.status && !MANUAL_APPLY_STATUS.includes(changes.status)) {
        throw new ApiError(400, '매칭 중·매칭 완료·커플 완료는 매칭 관리에서 매칭 상태를 바꾸면 저절로 정해져요.', 'DERIVED_STATUS');
      }

      const changed = Object.keys(changes).filter((k) => JSON.stringify(changes[k]) !== JSON.stringify(a[k]));
      Object.assign(a, changes, { updatedAt: nowIso() });
      if (!a.agreeSensitive) Object.assign(a, { religion: null, prefReligions: [] });
      const labels = [...new Set(changed.map((k) => FIELD_LABELS[k] ?? k))];
      audit(user, 'UPDATE_APPLICANT', tag(a), labels.length ? `변경 항목: ${labels.join(', ')}` : '변경 없음');
      commit();
      return { ...withAge(a), userStatus: userStatusOf(a) };
    },

    async changeStatus(ids, status) {
      await wait();
      const user = requireAdmin();
      if (!APPLY_STATUS_MAP[status]) throw new ApiError(400, '알 수 없는 상태예요.', 'VALIDATION');
      if (!MANUAL_APPLY_STATUS.includes(status)) {
        throw new ApiError(400, '매칭 중·매칭 완료·커플 완료는 매칭 관리에서 매칭 상태를 바꾸면 저절로 정해져요.', 'DERIVED_STATUS');
      }
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
      audit(user, 'DELETE_APPLICANT', tag(a), '신청서·매칭·하트 내역 완전 삭제');
      commit();
      return null;
    },

    async getCandidates(id) {
      await wait();
      requireAdmin();
      const target = findApplicant(id);
      return scoreCandidates(target, recommendPool(target), db.matches, db.codes).map(({ applicant: c, age, score, myScore, theirScore, reasons }) => ({
        id: c.id, name: c.name, gender: c.gender, age, division: c.division, team: c.team, campus: c.campus,
        mbti: c.mbti, face: c.face, status: c.status, score, myScore, theirScore, reasons,
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
          ...clone(m), source: m.source ?? 'ADMIN',
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
      if (a.id === b.id) throw new ApiError(400, '같은 사람끼리는 매칭할 수 없어요.', 'VALIDATION');
      if (Boolean(a.test) !== Boolean(b.test)) throw new ApiError(400, '개발 테스트 신청서와 실제 신청서는 이어줄 수 없어요.', 'VALIDATION');
      const busy = busyIds(db.matches);
      if (pendingMatchOf(a) || pendingMatchOf(b)) throw new ApiError(409, '두 분 중 한 분은 하트 맞교환 승인 대기 중이에요. 매칭 승인 대기에서 먼저 처리해 주세요.', 'MATCH_BUSY');
      if (busy.has(a.id) || busy.has(b.id)) throw new ApiError(409, '두 분 중 한 분은 이미 진행 중인 매칭이 있어요.', 'MATCH_BUSY');
      if (a.status === 'COUPLED' || b.status === 'COUPLED') throw new ApiError(409, '두 분 중 한 분은 이미 커플 완료 상태예요.', 'MATCH_BUSY');
      const score = scoreCandidates(a, db.applicants, db.matches, db.codes).find((c) => c.applicant.id === b.id)?.score ?? 0;
      const t = nowIso();
      const m = { id: ++db.seq.match, aId: a.id, bId: b.id, score, status: 'PROPOSED', source: 'ADMIN', memo, createdBy: user.name, createdAt: t, updatedAt: t };
      db.matches.push(m);
      syncStatuses(m);
      closeOpenHearts([a.id, b.id]); // 두 분에게 걸린 다른 응답 대기 하트 정리
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
      if (changes.status !== undefined && changes.status !== before && (before === PENDING_MATCH_STATUS || changes.status === PENDING_MATCH_STATUS)) {
        // 하트 맞교환 승인 대기는 승인(양측 수락) 또는 반려로만 바꾼다 — 다른 상태로 바로 옮기거나, 다른 매칭을 승인 대기로 되돌릴 수 없다
        if (before !== PENDING_MATCH_STATUS) throw new ApiError(400, "'승인 대기'는 하트 맞교환으로만 생겨요.", 'VALIDATION');
        if (changes.status === 'ACCEPTED') approvePending(m, user);
        else if (changes.status === 'REJECTED') rejectPending(m, user, changes.memo);
        else throw new ApiError(400, "승인 대기 매칭은 '양측 수락'(승인) 또는 '반려'로만 바꿀 수 있어요. 매칭 승인 대기 화면을 써 주세요.", 'VALIDATION');
        commit();
        return clone(m);
      }
      if (changes.status !== undefined) {
        if (!MATCH_STATUS.some((s) => s.value === changes.status)) throw new ApiError(400, '알 수 없는 매칭 상태예요.', 'VALIDATION');
        // 끝난 매칭을 다시 진행 중(또는 커플)으로 되돌릴 때, 그사이 둘 중 한 명이 다른 매칭에 들어갔으면 막는다
        // (예전: 한 사람이 진행 중인 매칭을 두 개 갖게 됐다)
        const live = (s) => ACTIVE_MATCH_STATUS.includes(s) || s === 'COUPLE';
        if (live(changes.status) && !live(before)) {
          const taken = db.matches.some(
            (o) => o.id !== m.id && live(o.status) && [o.aId, o.bId].some((x) => x === m.aId || x === m.bId),
          );
          if (taken) throw new ApiError(409, '두 분 중 한 분이 이미 다른 매칭을 진행 중이에요.', 'MATCH_BUSY');
        }
        m.status = changes.status;
        if ((m.status === 'ACCEPTED' || m.status === 'MET' || m.status === 'COUPLE') && !m.acceptedAt) m.acceptedAt = nowIso(); // 이후 후기 작성 가능
        if (m.status === 'COUPLE' && !m.coupledAt) m.coupledAt = nowIso();
      }
      if (changes.memo !== undefined) m.memo = String(changes.memo).slice(0, 300);
      m.updatedAt = nowIso();
      if (before !== m.status) syncStatuses(m);
      audit(user, 'MATCH_UPDATE', `매칭 #${m.id}`,
        before !== m.status ? `${textOf(MATCH_STATUS, before)} → ${textOf(MATCH_STATUS, m.status)}` : '메모 수정');
      commit();
      return clone(m);
    },

    /** 매칭 승인 대기 — 서로 하트를 보낸 두 분 (본인들은 아직 '매칭 대기 중'으로 보고 있다) */
    async listPendingMatches() {
      await wait();
      requireAdmin();
      const person = (id) => {
        const a = db.applicants.find((x) => x.id === id);
        if (!a) return null;
        return {
          id: a.id, name: a.name, nickname: a.nickname, gender: a.gender, age: ageOf(a.birthYear), division: a.division, team: a.team,
          campus: a.campus, mbti: a.mbti, status: a.status, test: Boolean(a.test), dislikes: dislikesOf(a), blacklisted: isBlacklisted(a.empNo),
        };
      };
      const heartOf = (from, to) => db.hearts.filter((h) => h.fromId === from && h.toId === to).sort((x, y) => y.at.localeCompare(x.at))[0] ?? null;
      return db.matches
        .filter((m) => m.status === PENDING_MATCH_STATUS)
        .map((m) => {
          const ab = heartOf(m.aId, m.bId);
          const ba = heartOf(m.bId, m.aId);
          return {
            id: m.id, score: m.score, createdAt: m.createdAt, a: person(m.aId), b: person(m.bId),
            // 보낸 하트 (answeredAt: 상대가 받은 하트를 수락한 시각 — 수락으로 이어졌으면 반대쪽 하트가 없다)
            hearts: {
              aToB: ab ? { at: ab.at, source: ab.source ?? 'DAILY', answeredAt: ab.answeredAt } : null,
              bToA: ba ? { at: ba.at, source: ba.source ?? 'DAILY', answeredAt: ba.answeredAt } : null,
            },
            conflict: busyElsewhere(m),
          };
        })
        .sort((x, y) => x.createdAt.localeCompare(y.createdAt));
    },
    /** 최종 매칭 — 승인 대기 → 양측 수락 (두 분 화면이 '매칭 중'으로 바뀌고 안내 쪽지가 간다) */
    async approveMatch(id) {
      await wait();
      const user = requireAdmin();
      const m = db.matches.find((x) => x.id === Number(id));
      if (!m) throw new ApiError(404, '매칭 내역을 찾을 수 없어요.', 'NOT_FOUND');
      approvePending(m, user);
      commit();
      return clone(m);
    },
    /** 반려 — 두 분에게는 알리지 않고 매칭 대기로 돌린다 */
    async rejectMatch(id, reason = '') {
      await wait();
      const user = requireAdmin();
      const m = db.matches.find((x) => x.id === Number(id));
      if (!m) throw new ApiError(404, '매칭 내역을 찾을 수 없어요.', 'NOT_FOUND');
      rejectPending(m, user, reason);
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

    // ── 기준정보 ──
    async listCodes(group) {
      await wait();
      requireAdmin();
      if (!CODE_GROUP_MAP[group]) throw new ApiError(404, '없는 기준정보 그룹이에요.', 'NOT_FOUND');
      return db.codes[group].map((c) => ({ ...clone(c), usedBy: codeInUse(group, c.value).n }));
    },

    async createCode(group, item) {
      await wait();
      const user = requireAdmin();
      const g = CODE_GROUP_MAP[group];
      if (!g) throw new ApiError(404, '없는 기준정보 그룹이에요.', 'NOT_FOUND');
      const value = String(item.value ?? '').trim().toUpperCase();
      const text = String(item.text ?? '').trim();
      if (!/^[A-Z0-9_]{1,30}$/.test(value)) throw new ApiError(400, '코드는 영문 대문자·숫자·_ 30자 이내로 적어주세요.', 'VALIDATION');
      if (!text || text.length > 40) throw new ApiError(400, '표시 이름을 1~40자로 적어주세요.', 'VALIDATION');
      if (db.codes[group].some((c) => c.value === value)) throw new ApiError(409, `이미 있는 코드예요: ${value}`, 'DUPLICATE');
      if (g.parent && !db.codes[g.parent].some((c) => c.value === item.parent)) {
        throw new ApiError(400, `${CODE_GROUP_MAP[g.parent].text}을(를) 골라주세요.`, 'VALIDATION');
      }
      const order = Number.isFinite(Number(item.order)) && item.order !== null && item.order !== '' ? Number(item.order)
        : Math.max(0, ...db.codes[group].map((c) => c.order)) + 10;
      const c = { value, text, order, use: item.use !== false, ...(g.parent && { parent: item.parent }), ...(g.attrLabel && { attr: item.attr ?? '' }) };
      db.codes[group].push(c);
      audit(user, 'CODE_CHANGE', `기준정보 · ${g.text}`, `항목 추가: ${text}`);
      commit();
      return clone(c);
    },

    async updateCode(group, value, changes) {
      await wait();
      const user = requireAdmin();
      const g = CODE_GROUP_MAP[group];
      const c = g && db.codes[group].find((x) => x.value === value);
      if (!c) throw new ApiError(404, '기준정보 항목을 찾을 수 없어요.', 'NOT_FOUND');
      if (changes.value !== undefined && changes.value !== value) {
        throw new ApiError(400, '코드 값은 바꿀 수 없어요. 새 항목을 만들고 이 항목은 사용 안 함으로 바꿔주세요.', 'VALIDATION');
      }
      if (changes.text !== undefined) {
        const text = String(changes.text).trim();
        if (!text || text.length > 40) throw new ApiError(400, '표시 이름을 1~40자로 적어주세요.', 'VALIDATION');
        c.text = text;
      }
      if (changes.order !== undefined) c.order = Number(changes.order) || 0;
      if (changes.use !== undefined) c.use = Boolean(changes.use);
      if (g.parent && changes.parent !== undefined) {
        if (!db.codes[g.parent].some((p) => p.value === changes.parent)) throw new ApiError(400, '상위 항목을 확인해 주세요.', 'VALIDATION');
        if (changes.parent !== c.parent && codeInUse(group, value).n) {
          throw new ApiError(409, '신청서가 쓰고 있는 항목이라 상위 항목을 바꿀 수 없어요.', 'IN_USE');
        }
        c.parent = changes.parent;
      }
      if (g.attrLabel && changes.attr !== undefined) c.attr = String(changes.attr ?? '').trim().slice(0, 20);
      const what = Object.keys(changes).map((k) => ({ text: '이름', order: '순서', use: '사용 여부', parent: '상위', attr: '보조 값' })[k]).filter(Boolean);
      audit(user, 'CODE_CHANGE', `기준정보 · ${g.text}`, `${c.text} 수정: ${what.join(', ')}`);
      commit();
      return clone(c);
    },

    async deleteCode(group, value) {
      await wait();
      const user = requireAdmin();
      const g = CODE_GROUP_MAP[group];
      const c = g && db.codes[group].find((x) => x.value === value);
      if (!c) throw new ApiError(404, '기준정보 항목을 찾을 수 없어요.', 'NOT_FOUND');
      const { n, children } = codeInUse(group, value);
      if (children) throw new ApiError(409, `이 캠퍼스에 속한 건물 ${children}개를 먼저 정리해 주세요.`, 'IN_USE');
      if (n) throw new ApiError(409, `신청서 ${n}건이 쓰고 있어 지울 수 없어요. '사용'을 끄면 새 선택지에서만 숨겨져요.`, 'IN_USE');
      db.codes[group] = db.codes[group].filter((x) => x !== c);
      audit(user, 'CODE_CHANGE', `기준정보 · ${g.text}`, `항목 삭제: ${c.text}`);
      commit();
      return null;
    },

    /** 기준정보·설정 전체 내보내기 — 엑셀·JSON 파일로 저장해 고친 뒤 importReference 로 되돌려 넣는다 */
    async exportReference() {
      await wait();
      requireAdmin();
      const codes = Object.fromEntries(
        Object.keys(CODE_GROUP_MAP).map((g) => [g, [...(db.codes[g] ?? [])].sort((a, b) => a.order - b.order).map(clone)]),
      );
      return { kind: REFERENCE_KIND, version: 1, exportedAt: nowIso(), codes, settings: pickFields(db.settings, SETTING_ITEMS.map((x) => x.key)) };
    },

    /**
     * 기준정보·설정 일괄 변경. apply=false 면 바뀔 내용만 돌려준다(미리보기)
     * 적용할 때도 같은 파일로 다시 계산하므로, 미리보기와 적용 사이에 다른 사람이 바꾼 내용도 반영된다
     */
    async importReference(payload, { apply = false } = {}) {
      await wait();
      const user = requireAdmin();
      const plan = planReference(payload);
      const out = {
        ok: !plan.errors.length,
        applied: false,
        errors: plan.errors.slice(0, 100),
        notes: plan.notes,
        changes: plan.changes,
        settingsChanges: plan.settingsChanges,
        summary: plan.summary,
      };
      if (!apply || plan.errors.length || (!plan.changes.length && !plan.settingsChanges.length)) return out;
      db.codes = plan.nextCodes;
      if (plan.nextSettings) db.settings = plan.nextSettings;
      const count = (a) => plan.changes.filter((x) => x.action === a).length;
      audit(
        user, 'REFERENCE_IMPORT', '기준정보 일괄 변경',
        `추가 ${count('ADD')} · 수정 ${count('UPDATE')} · 사용 안 함 ${count('DISABLE')} · 삭제 ${count('REMOVE')} · 설정 ${plan.settingsChanges.length}`,
      );
      commit();
      return { ...out, applied: true };
    },

    // ── 후기 ──
    async listReviews() {
      await wait();
      const user = requireAdmin();
      audit(user, 'VIEW_REVIEWS', '후기 목록', `${db.reviews.length}건`);
      commit();
      const who = (id) => {
        const a = db.applicants.find((x) => x.id === id);
        return a ? { id: a.id, name: a.name, dislikes: dislikesOf(a), sanctioned: isSanctioned(a) } : { id, name: '(탈퇴)' };
      };
      return db.reviews.map((r) => ({ ...clone(r), reviewer: who(r.reviewerId), target: who(r.targetId), countsAsDislike: countsAsDislike(r) }));
    },

    /** 싫어요 제재 해제 — 지금까지 받은 수를 0으로 되돌린다 (후기 원문은 그대로) */
    async resetDislikes(id) {
      await wait();
      const user = requireAdmin();
      const a = findApplicant(id);
      const n = dislikesOf(a);
      a.dislikeOffset = (a.dislikeOffset ?? 0) + n;
      audit(user, 'SANCTION_RESET', tag(a), `싫어요 ${n}회 초기화`);
      commit();
      return { dislikes: dislikesOf(a), sanctioned: isSanctioned(a) };
    },

    // ── 시스템 개선의 소리 ──
    async listVocs() {
      await wait();
      requireAdmin();
      return db.vocs.map(({ ownerEmpNo, ...v }) => clone(v)); // 작성자 사번은 주지 않는다 (실명 글은 이름·팀, 익명 글은 알 수 없음)
    },

    async updateVoc(id, { status, reply }) {
      await wait();
      const user = requireAdmin();
      const v = db.vocs.find((x) => x.id === Number(id));
      if (!v) throw new ApiError(404, '글을 찾을 수 없어요.', 'NOT_FOUND');
      if (status !== undefined) {
        if (!VOC_STATUS.some((x) => x.value === status)) throw new ApiError(400, '알 수 없는 상태예요.', 'VALIDATION');
        v.status = status;
      }
      if (reply !== undefined) v.reply = String(reply ?? '').trim().slice(0, 500);
      v.updatedAt = nowIso();
      audit(user, 'VOC_UPDATE', `개선의 소리 #${v.id}`, `${textOf(VOC_STATUS, v.status)}${reply !== undefined ? ' · 답변 수정' : ''}`);
      commit();
      const { ownerEmpNo, ...rest } = v;
      return clone(rest);
    },

    // ── 쪽지 — 담당자는 매칭별·사용자별로 볼 수 있다(운영·신고 대응 목적, 열람 기록이 남는다) ──
    /** 매칭별: 서로 수락한 적 있는 매칭마다 오간 쪽지 수 */
    async messageMatches() {
      await wait();
      requireAdmin();
      const who = (id) => db.applicants.find((x) => x.id === id);
      return db.matches
        .filter((m) => m.acceptedAt)
        .map((m) => {
          const msgs = db.messages.filter((x) => x.thread === `M${m.id}`);
          const a = who(m.aId);
          const b = who(m.bId);
          return {
            matchId: m.id, status: m.status, open: matchSendable(m), acceptedAt: m.acceptedAt,
            aName: a?.name ?? '(탈퇴)', aNick: a?.nickname ?? '', bName: b?.name ?? '(탈퇴)', bNick: b?.nickname ?? '',
            count: msgs.length, lastAt: msgs.at(-1)?.at ?? null, last: msgs.at(-1)?.body ?? '',
          };
        })
        .sort((x, y) => (y.lastAt ?? y.acceptedAt).localeCompare(x.lastAt ?? x.acceptedAt));
    },
    async matchMessages(matchId) {
      await wait();
      const user = requireAdmin();
      const m = db.matches.find((x) => x.id === Number(matchId));
      if (!m) throw new ApiError(404, '매칭 내역을 찾을 수 없어요.', 'NOT_FOUND');
      const nameOf = (id) => {
        const a = db.applicants.find((x) => x.id === id);
        return a ? `${a.name} (${a.nickname})` : '(탈퇴)';
      };
      const msgs = db.messages.filter((x) => x.thread === `M${m.id}`);
      audit(user, 'VIEW_MESSAGES', `매칭 #${m.id}`, `${msgs.length}통`);
      commit();
      return msgs.map((x) => ({ id: x.id, from: nameOf(x.fromId), to: nameOf(x.toId), body: x.body, at: x.at, readAt: x.readAt, channel: `매칭 #${m.id}` }));
    },
    /** 사용자별: 신청자마다 담당자 쪽지 + 매칭 쪽지 수 */
    async messageUsers() {
      await wait();
      requireAdmin();
      return db.applicants.map((a) => {
        const msgs = db.messages.filter((m) => m.thread === `A${a.id}` || m.fromId === a.id || m.toId === a.id);
        return {
          applicantId: a.id, name: a.name, nickname: a.nickname, team: a.team, userStatus: userStatusOf(a),
          count: msgs.length, unread: msgs.filter((m) => m.toAdmin && m.fromId === a.id && !m.readAt).length,
          lastAt: msgs.at(-1)?.at ?? null, last: msgs.at(-1)?.body ?? '',
        };
      });
    },
    async userMessages(applicantId) {
      await wait();
      const user = requireAdmin();
      const a = findApplicant(applicantId);
      const label = (id, admin, adminName) => {
        if (admin) return `담당자${adminName ? ` ${adminName}` : ''}`;
        const x = db.applicants.find((y) => y.id === id);
        return x ? `${x.name} (${x.nickname})` : '(탈퇴)';
      };
      const msgs = db.messages.filter((m) => m.thread === `A${a.id}` || m.fromId === a.id || m.toId === a.id);
      for (const m of msgs) if (m.toAdmin && m.fromId === a.id && !m.readAt) m.readAt = nowIso();
      if (msgs.some((m) => m.thread.startsWith('M'))) audit(user, 'VIEW_MESSAGES', tag(a), `${msgs.length}통 (매칭 쪽지 포함)`);
      commit();
      return msgs.map((m) => ({
        id: m.id, channel: m.thread.startsWith('A') ? '담당자' : `매칭 #${m.thread.slice(1)}`, adminThread: m.thread.startsWith('A'),
        from: label(m.fromId, m.fromAdmin, m.adminName), to: label(m.toId, m.toAdmin && !m.toId, null), outFromAdmin: Boolean(m.fromAdmin),
        body: m.body, at: m.at, readAt: m.readAt,
      }));
    },
    async sendMessage(applicantId, body) {
      await wait();
      const user = requireAdmin();
      const a = findApplicant(applicantId);
      const text = String(body ?? '').trim();
      if (!text || text.length > 500) throw new ApiError(400, '쪽지는 1~500자로 적어주세요.', 'VALIDATION');
      db.messages.push({ id: (db.seq.message = (db.seq.message ?? 0) + 1), thread: `A${a.id}`, fromId: null, fromAdmin: true, adminName: user.name, toId: a.id, body: text, at: nowIso(), readAt: null, box: {} });
      audit(user, 'MESSAGE_SEND', tag(a), `${text.length}자`);
      commit();
      return null;
    },

    // ── 싫어요 누적 · 블랙리스트 ──
    async listDislikes() {
      await wait();
      requireAdmin();
      return db.applicants
        .map((a) => ({ id: a.id, name: a.name, nickname: a.nickname, team: a.team, dislikes: dislikesOf(a), sanctioned: isSanctioned(a) }))
        .filter((a) => a.dislikes > 0)
        .sort((x, y) => y.dislikes - x.dislikes);
    },
    /** 블랙리스트 등록 대상 검색 — 재직 임직원(이름·사번·팀) */
    async searchEmployees(q) {
      await wait();
      requireAdmin();
      const k = String(q ?? '').trim();
      if (k.length < 1) return [];
      // 사緣에 로그인한 적 있는 임직원 + (연결돼 있으면) 사내 인사 검색 결과
      const found = new Map();
      for (const e of db.employees) {
        if (!e.retired && (e.name.includes(k) || e.empNo.includes(k) || e.team.includes(k) || (e.adId ?? '').includes(k))) found.set(e.empNo, e);
      }
      if (A.directory.search) {
        try {
          for (const p of (await A.directory.search(k)) ?? []) if (p?.empNo && p.active !== false && !found.has(String(p.empNo))) found.set(String(p.empNo), p);
        } catch {
          /* 인사 검색이 실패해도 로그인 이력 결과는 보여준다 */
        }
      }
      return [...found.values()]
        .slice(0, 30)
        .map((e) => ({ empNo: String(e.empNo), name: e.name, team: e.team, applied: Boolean(myApplication(e)), blocked: isBlacklisted(String(e.empNo)) }));
    },
    async listBlacklist() {
      await wait();
      requireAdmin();
      return db.blacklist.map((b) => {
        const e = db.employees.find((x) => x.empNo === b.empNo);
        const app = e && myApplication(e);
        return { ...clone(b), name: e?.name ?? '(알 수 없음)', team: e?.team ?? '', applied: Boolean(app) };
      });
    },
    async addBlacklist(empNo, reason = '') {
      await wait();
      const user = requireAdmin();
      let e = db.employees.find((x) => x.empNo === String(empNo));
      // 사緣에 로그인한 적 없는 임직원도 등록할 수 있게 사내 인사 정보에서 찾아 둔다
      if (!e && A.directory.lookup) {
        const p = await Promise.resolve().then(() => A.directory.lookup(String(empNo))).catch(() => null);
        if (p) e = upsertEmployee(p);
      }
      if (!e) throw new ApiError(404, '임직원을 찾을 수 없어요.', 'NOT_FOUND');
      if (isBlacklisted(e.empNo)) throw new ApiError(409, '이미 블랙리스트에 있어요.', 'DUPLICATE');
      const why = String(reason ?? '').trim().slice(0, 200);
      if (!why) throw new ApiError(400, '등록 사유를 적어주세요. (열람 기록에 남아요)', 'VALIDATION');
      db.blacklist.push({ empNo: e.empNo, reason: why, at: nowIso(), by: user.name });
      // 진행 중인 하트는 정리하고, 이미 낸 신청서는 매칭 후보에서 빠진다 (본인에게는 알리지 않음)
      const app = myApplication(e);
      if (app) for (const h of db.hearts.filter((x) => (x.fromId === app.id || x.toId === app.id) && x.status === 'SENT')) Object.assign(h, { status: 'EXPIRED', answeredAt: nowIso() });
      audit(user, 'BLACKLIST_ADD', `${e.empNo} ${initials(e.name)}`, why);
      commit();
      return null;
    },
    async removeBlacklist(empNo) {
      await wait();
      const user = requireAdmin();
      const b = db.blacklist.find((x) => x.empNo === String(empNo));
      if (!b) throw new ApiError(404, '블랙리스트에 없는 사번이에요.', 'NOT_FOUND');
      db.blacklist = db.blacklist.filter((x) => x !== b);
      const e = db.employees.find((x) => x.empNo === b.empNo);
      audit(user, 'BLACKLIST_REMOVE', `${b.empNo} ${initials(e?.name ?? '')}`);
      commit();
      return null;
    },

    // ── 설정 ──
    async getSettings() {
      await wait();
      requireAdmin();
      return { ...db.settings };
    },

    async updateSettings(changes) {
      await wait();
      const user = requireAdmin();
      const next = settingsAfter(db.settings, changes ?? {});
      const what = Object.keys(changes).filter((k) => k in next && next[k] !== db.settings[k]);
      db.settings = next;
      audit(user, 'SETTINGS_CHANGE', '설정', what.length ? `변경: ${what.join(', ')}` : '변경 없음');
      commit();
      return { ...db.settings };
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

    // ── DB 표 (목적별 표를 그대로 보고 고친다 — 표 정의: shared/db/tables.js) ──
    /** 표 목록 · 행 수 · 열 */
    async tables() {
      await wait();
      requireAdmin();
      const rows = rowsOf(db);
      return TABLES.map((t) => ({
        coll: t.coll, table: t.table, label: t.label, kind: t.kind, readOnly: Boolean(t.readOnly), key: t.key ?? null,
        count: rows.get(t.table).length,
        tests: t.coll === 'applicants' || t.coll === 'employees' ? rows.get(t.table).filter((r) => r.doc?.test).length : 0,
        columns: t.cols.map(([name, , type, text]) => ({ name, type: type.split(':')[0], text })),
      }));
    },
    /** 표 한 개의 행 — cells: 보기용 열 · doc: 원본(이 값을 고친다) */
    async tableRows(coll) {
      await wait();
      requireAdmin();
      const t = tableOf(coll);
      return rowsOf(db).get(t.table).map((row) => ({
        id: row.id,
        key: row.keys.length === 1 ? row.keys[0] : row.keys.join('.'),
        test: Boolean(row.doc?.test),
        cells: Object.fromEntries(t.cols.map((col) => {
          const v = cellOf(t, row, col);
          return [col[0], v instanceof Date ? v.toISOString() : v];
        })),
        doc: clone(row.doc),
      }));
    },
    /**
     * 행 추가·수정 — id 가 없으면 추가. list 표는 원본의 키 필드(id·empNo)가 행 키, map 표는 key 로 정한다
     * 번호(id)를 비우고 추가하면 다음 번호를 붙인다. 기록에 남는다
     */
    async saveTableRow(coll, id, { key, doc } = {}) {
      await wait();
      const user = requireAdmin();
      const t = tableOf(coll);
      if (t.readOnly) throw new ApiError(403, `${t.label}은(는) 여기서 고칠 수 없어요. ${t.coll === 'codes' ? '기준정보' : t.coll === 'settings' ? '설정' : '해당'} 화면을 써 주세요.`, 'READ_ONLY');
      if (!doc || typeof doc !== 'object' || Array.isArray(doc)) throw new ApiError(400, '행 내용은 { } 객체여야 해요.', 'VALIDATION');
      if (JSON.stringify(doc).length > 100_000) throw new ApiError(400, '행 내용이 너무 커요 (100KB 이하).', 'VALIDATION');
      const isNew = id === null || id === undefined || id === '';
      const next = clone(doc);
      let rowKey;
      if (t.kind === 'list') {
        const keyType = keyColsOf(t)[0][2];
        if ((next[t.key] === undefined || next[t.key] === null || next[t.key] === '') && isNew && t.seq) next[t.key] = ++db.seq[t.seq];
        if (keyType === 'int') next[t.key] = Number(next[t.key]);
        if (keyType === 'int' ? !Number.isInteger(next[t.key]) || next[t.key] <= 0 : !String(next[t.key] ?? '').trim()) {
          throw new ApiError(400, `행 키(${t.key})를 ${keyType === 'int' ? '1 이상의 숫자로' : ''} 넣어 주세요.`, 'VALIDATION');
        }
        rowKey = String(next[t.key]);
        const list = db[t.coll];
        const at = isNew ? -1 : list.findIndex((x) => String(x[t.key]) === String(id));
        if (!isNew && at < 0) throw new ApiError(404, '그 행이 없어요. 새로고침해 주세요.', 'NOT_FOUND');
        if (list.some((x, i) => i !== at && String(x[t.key]) === rowKey)) throw new ApiError(409, `${t.key} ${rowKey} 행이 이미 있어요.`, 'DUPLICATE');
        if (t.seq && keyType === 'int' && next[t.key] > db.seq[t.seq]) db.seq[t.seq] = next[t.key]; // 다음 번호가 겹치지 않게
        if (at < 0) list.push(next);
        else list[at] = next;
      } else {
        rowKey = String(key ?? id ?? '').trim();
        if (t.keyType === 'int' && !/^\d+$/.test(rowKey)) throw new ApiError(400, '행 키를 숫자로 넣어 주세요.', 'VALIDATION');
        if (!rowKey) throw new ApiError(400, '행 키를 넣어 주세요.', 'VALIDATION');
        if (!isNew && !(String(id) in db[t.coll])) throw new ApiError(404, '그 행이 없어요. 새로고침해 주세요.', 'NOT_FOUND');
        if (rowKey !== String(id) && rowKey in db[t.coll]) throw new ApiError(409, `키 ${rowKey} 행이 이미 있어요.`, 'DUPLICATE');
        if (!isNew && rowKey !== String(id)) delete db[t.coll][id];
        db[t.coll][rowKey] = next;
      }
      audit(user, 'DATA_EDIT', `${t.table} ${rowKey}`, isNew ? '행 추가' : rowKey === String(id) ? '행 수정' : `행 수정 (키 ${id} → ${rowKey})`);
      commit();
      return { id: rowKey };
    },
    /** 행 삭제 — 신청서는 매칭·하트·쪽지까지 함께 정리한다 (신청자 관리의 삭제와 같다) */
    async deleteTableRow(coll, id) {
      await wait();
      const user = requireAdmin();
      const t = tableOf(coll);
      if (t.readOnly) throw new ApiError(403, `${t.label}은(는) 여기서 지울 수 없어요.`, 'READ_ONLY');
      if (t.kind === 'list') {
        const row = db[t.coll].find((x) => String(x[t.key]) === String(id));
        if (!row) throw new ApiError(404, '그 행이 없어요. 새로고침해 주세요.', 'NOT_FOUND');
        if (t.coll === 'applicants') removeApplicant(row);
        else db[t.coll] = db[t.coll].filter((x) => x !== row);
      } else {
        if (!(String(id) in db[t.coll])) throw new ApiError(404, '그 행이 없어요. 새로고침해 주세요.', 'NOT_FOUND');
        delete db[t.coll][id];
      }
      audit(user, 'DATA_DELETE', `${t.table} ${id}`, t.coll === 'applicants' ? '신청서와 관련 매칭·하트·쪽지 삭제' : '행 삭제');
      commit();
      return null;
    },
    /** 개발 테스트 데이터 지우기 — 테스트 사번(npm run dev)의 신청서(관련 매칭·하트·쪽지 포함)와 로그인 기록 */
    async purgeTestData() {
      await wait();
      const user = requireAdmin();
      const apps = db.applicants.filter((a) => a.test);
      for (const a of apps) removeApplicant(a);
      const emps = db.employees.filter((e) => e.test && e.empNo !== user.empNo); // 지금 로그인한 계정은 남긴다
      const gone = new Set(emps.map((e) => e.empNo));
      db.employees = db.employees.filter((e) => !gone.has(e.empNo));
      for (const m of ['sajuPicks', 'penalties', 'adminLocks']) for (const k of Object.keys(db[m])) if (gone.has(k)) delete db[m][k];
      audit(user, 'DATA_PURGE_TEST', '개발 테스트 데이터', `신청서 ${apps.length}건 · 테스트 계정 ${emps.length}개`);
      commit();
      return { applicants: apps.length, employees: emps.length };
    },
  },

  /** 개발 모드 전용 (서버에서는 막힌다) */
  dev: {
    reset() {
      if (!A.allowDev) throw new ApiError(403, '테스트 모드에서만 쓸 수 있어요.', 'FORBIDDEN');
      // 예전: 초기값을 맞추지 않아 초기화 직후(새로고침 전) 사주 인연 찾기가 오류를 냈다
      db = normalize(A.initial());
      commit();
      setSession({});
    },
    /** 오늘 후보·하트 제한을 초기화해 '다음 날'을 흉내 낸다 */
    nextDay() {
      if (!A.allowDev) throw new ApiError(403, '테스트 모드에서만 쓸 수 있어요.', 'FORBIDDEN');
      const app = myApplication(requireUser());
      if (!app) return;
      delete db.daily[app.id];
      // 하루 + 보낸 하트 응답 기한(72시간)도 지난 것으로 친다 (테스트용)
      for (const h of db.hearts) if (h.fromId === app.id) h.at = new Date(Date.parse(h.at) - 4 * DAY).toISOString();
      commit();
    },
  },
};

