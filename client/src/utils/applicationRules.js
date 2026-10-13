/**
 * 신청서 유효성 규칙 — 화면(DxForm)과 서버(검증 미들웨어)가 같은 기준을 쓰도록 한 곳에 모은다.
 * 선택 목록은 기준정보(codes)로 검증하므로 validateApplication(a, codes)처럼 기준정보를 함께 넘긴다.
 */
import { GENDERS, AVOID_OPTIONS, PREF_ITEMS, PREF_ITEM_MAP, MAX_PRIORITIES, SERIOUSNESS, AGE_GAP } from '../constants/codes.js';
import { NICKNAME_RULE, isBannedNickname } from './nickname.js';
import { isValidCode, rankOf } from './codeHelpers.js';

export const THIS_YEAR = new Date().getFullYear();

/** 만 나이 (2023.6 만 나이 통일법 기준) */
export function ageOf(birthDate, today = new Date()) {
  if (!birthDate) return null;
  const [y, m, d] = String(birthDate).split('-').map(Number);
  if (!y || !m || !d) return null;
  let age = today.getFullYear() - y;
  if (today.getMonth() + 1 < m || (today.getMonth() + 1 === m && today.getDate() < d)) age -= 1;
  return age;
}

export const RULES = {
  // 이름은 사내 인사정보 값이라 신청자가 고칠 수 없다. 외국인 임직원(Anne-Marie, O'Brien)이나 가운뎃점이 든 이름도
  // 통과하도록 글자 종류만 본다 (예전: 한글 2~10자/영문만 허용해 일부 임직원은 신청 자체가 막혔다)
  name: { pattern: /^\p{L}[\p{L}\s.'·-]{0,39}$/u, message: '이름 형식을 확인해 주세요.' },
  age: { min: 19, max: 60 },
  birthTime: { pattern: /^([01]\d|2[0-3]):[0-5]\d$/ },
  // 인사정보의 팀 이름에는 'S/W개발팀', 'Memory Sol. 기획그룹'처럼 / . , + 가 들어갈 수 있다
  team: { pattern: /^[\p{L}\p{N}&·()\s\-/.,+_']{2,30}$/u, message: '2~30자로 입력해 주세요.' },
  nickname: NICKNAME_RULE,
  building: { pattern: /^[가-힣A-Za-z0-9&·()\s-]{1,30}$/, message: '30자 이내로 적어주세요. (한글·영문·숫자)' },
  residence: { max: 30 },
  hobbies: { min: 1, max: 5 },
  comment: { max: 300 },
  prefAge: { min: 19, max: 60 },
  priorities: { min: 1, max: MAX_PRIORITIES },
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const len = (s) => (s ?? '').trim().length;
const isArr = (v) => Array.isArray(v);
const uniq = (arr) => new Set(arr).size === arr.length;
const allCodes = (codes, group, arr, opt) => isArr(arr) && uniq(arr) && arr.every((v) => isValidCode(codes, group, v, opt));

/** 우선순위로 고른 선호 항목이 실제로 채워져 있는가 */
export function prefIsSet(a, item) {
  if (item === 'AGE') return a.prefAgeMin != null && a.prefAgeMax != null;
  if (item === 'HEIGHT') return Boolean(a.prefHeightMin && a.prefHeightMax);
  const key = PREF_ITEM_MAP[item]?.key;
  return Boolean(key && isArr(a[key]) && a[key].length);
}

/**
 * 서버 측 최종 검증. 잘못된 항목 이름 배열을 돌려준다(빈 배열이면 통과).
 * @param {object} a API 형식의 신청 데이터
 * @param {object} codes 기준정보
 * @param {{ requireConsent?: boolean, previous?: object }} opt
 *   requireConsent: 관리자 수정 시에는 동의 항목을 다시 검사하지 않는다
 *   previous: 수정 전 신청서 — 그새 '사용 안 함'이 된 코드라도 기존 값 그대로면 허용
 */
export function validateApplication(a, codes, { requireConsent = true, previous = null } = {}) {
  const e = [];
  const keep = (field) => (v) => previous && JSON.stringify(previous[field]) === JSON.stringify(v);
  const code = (group, field, required = true) => {
    const v = a[field];
    if (v == null || v === '') return !required;
    return isValidCode(codes, group, v, { allowInactive: keep(field)(v) });
  };
  const codesArr = (group, field) => allCodes(codes, group, a[field] ?? [], { allowInactive: keep(field)(a[field]) });

  // ── 나 ──
  if (!RULES.name.pattern.test(a.name ?? '')) e.push('이름');
  if (!RULES.nickname.pattern.test(a.nickname ?? '') || isBannedNickname(a.nickname ?? '')) e.push('닉네임');
  if (!GENDERS.some((g) => g.value === a.gender)) e.push('성별');
  if (!SERIOUSNESS.some((x) => x.value === a.serious)) e.push('진지한 만남 여부');
  const age = DATE_RE.test(a.birthDate ?? '') ? ageOf(a.birthDate) : null;
  if (age == null || age < RULES.age.min || age > RULES.age.max) e.push('생년월일');
  if (a.birthTime != null && a.birthTime !== '' && !RULES.birthTime.pattern.test(a.birthTime)) e.push('태어난 시간');
  if (!code('HEIGHT', 'heightBand')) e.push('키');
  if (!codesArr('HOBBY', 'hobbies') || a.hobbies.length < RULES.hobbies.min || a.hobbies.length > RULES.hobbies.max) e.push('취미');
  if (!code('MBTI', 'mbti')) e.push('MBTI');
  if (a.religion && (!a.agreeSensitive || !code('RELIGION', 'religion'))) e.push('종교(민감정보 동의 필요)');
  if (len(a.residence) > RULES.residence.max) e.push('사는 곳');
  if (!code('DIVISION', 'division')) e.push('사업부');
  if (!RULES.team.pattern.test((a.team ?? '').trim())) e.push('팀');
  if (!code('CAMPUS', 'campus', false)) e.push('캠퍼스');
  if (a.building && !RULES.building.pattern.test(String(a.building).trim())) e.push('건물 위치');
  if (len(a.comment) > RULES.comment.max) e.push('코멘트');
  if (!code('FACE', 'face')) e.push('얼굴상');
  if (!code('BODY', 'body')) e.push('체형');
  if (!code('LOOKS', 'looks')) e.push('외모');
  if (!code('DRINKING', 'drinking')) e.push('음주');
  if (!code('SMOKING', 'smoking')) e.push('흡연');

  // ── 선호 ──
  const { min, max } = RULES.prefAge;
  if (!(a.prefAgeMin >= min && a.prefAgeMax <= max && a.prefAgeMin <= a.prefAgeMax)) e.push('선호 나이');
  const hasHeight = a.prefHeightMin || a.prefHeightMax;
  if (hasHeight) {
    const lo = rankOf(codes, 'HEIGHT', a.prefHeightMin);
    const hi = rankOf(codes, 'HEIGHT', a.prefHeightMax);
    if (lo < 0 || hi < 0 || lo > hi) e.push('선호 키');
  }
  if (!isArr(a.avoid) || !uniq(a.avoid) || !a.avoid.every((v) => AVOID_OPTIONS.some((o) => o.value === v))) e.push('피하고 싶은 범위');
  for (const p of PREF_ITEMS.filter((x) => x.kind === 'multi')) {
    if (p.fixed) {
      const v = a[p.key] ?? [];
      if (!isArr(v) || !uniq(v) || !v.every((x) => AGE_GAP.some((g) => g.value === x))) e.push(`선호 ${p.text}`);
    } else if (!codesArr(p.group, p.key)) e.push(`선호 ${p.text}`);
  }
  if ((a.prefReligions ?? []).length && !a.agreeSensitive) e.push('선호 종교(민감정보 동의 필요)');

  const pr = a.priorities ?? [];
  if (!isArr(pr) || !uniq(pr) || pr.length < RULES.priorities.min || pr.length > RULES.priorities.max || !pr.every((v) => PREF_ITEM_MAP[v])) {
    e.push('선호 우선순위');
  } else {
    const unset = pr.filter((v) => !prefIsSet(a, v));
    if (unset.length) e.push(`선호 우선순위(${unset.map((v) => PREF_ITEM_MAP[v].text).join('·')} 선호 미입력)`);
  }

  if (requireConsent && (!a.agreePrivacy || !a.agreeShare)) e.push('필수 동의');
  return e;
}
