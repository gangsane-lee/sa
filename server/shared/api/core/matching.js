/**
 * 매칭 후보 추천 (점수 0~100)
 * mock 전용이 아니라 서버의 일일 후보(/me/daily)·관리자 추천(/admin/applicants/:id/candidates)이 그대로 옮겨 쓸 로직이다.
 *
 * 1) 제외 조건 — 하나라도 걸리면 후보에서 뺀다
 *    같은 성별 / 매칭 완료·보류 / 진행 중인 매칭 있음 / 예전에 맺어졌던 상대
 *    서로의 '피하고 싶은 범위'(같은 팀·같은 건물·같은 사업부) / 양쪽 모두 선호 나이 밖
 * 2) 선호 적합도 — 내가 고른 선호 항목을 상대가 얼마나 만족하는지
 *    우선순위 1~5위 가중치 5·4·3·2·1, 우선순위 밖에서 고른 항목은 0.5. 고르지 않은(상관없음) 항목은 계산에서 뺀다
 * 3) 최종 점수 = (내 선호 적합도 + 상대 선호 적합도) / 2  → 서로에게 맞는 사람이 위로
 */
import { ACTIVE_MATCH_STATUS, BUSY_MATCH_STATUS, PREF_ITEMS, RECOMMENDABLE_STATUS } from '../../constants/codes.js';
import { ageOf, yearOf, prefIsSet } from '../../utils/applicationRules.js';
import { rankOf, findCode } from '../../utils/codeHelpers.js';

const PRIORITY_WEIGHTS = [5, 4, 3, 2, 1];
const EXTRA_WEIGHT = 0.5;

const norm = (s = '') => s.replace(/\s/g, '').toLowerCase();

/** 선호 항목 → 상대의 어떤 값과 비교하는지 */
const OWN_FIELD = {
  DIVISION: 'division', FACE: 'face', HOBBY: 'hobbies', DRINKING: 'drinking',
  MBTI: 'mbti', RELIGION: 'religion', SMOKING: 'smoking', BODY: 'body',
};

/** a가 b를 '피하고 싶은 범위'로 지정했는가 */
function avoids(a, b) {
  const set = new Set(a.avoid ?? []);
  if (set.has('DIVISION') && a.division === b.division) return true;
  if (set.has('TEAM') && a.division === b.division && norm(a.team) === norm(b.team)) return true;
  // 건물은 직접 입력이라 같은 캠퍼스 + 이름이 같을 때(공백·대소문자 무시)만 같은 건물로 본다
  if (set.has('BUILDING') && a.building && b.building && a.campus === b.campus && norm(a.building) === norm(b.building)) return true;
  return false;
}

const inPrefAge = (age, who) => age >= who.prefAgeMin && age <= who.prefAgeMax;

function satisfies(me, other, item, codes) {
  if (item === 'AGE') return inPrefAge(ageOf(other.birthYear), me);
  if (item === 'AGEGAP') {
    // 출생연도 기준: 상대가 먼저 태어났으면 연상, 같으면 동갑
    const my = yearOf(me.birthYear);
    const their = yearOf(other.birthYear);
    const gap = their < my ? 'OLDER' : their === my ? 'SAME' : 'YOUNGER';
    return (me.prefAgeGap ?? []).includes(gap);
  }
  if (item === 'HEIGHT') {
    const r = rankOf(codes, 'HEIGHT', other.heightBand);
    return r >= rankOf(codes, 'HEIGHT', me.prefHeightMin) && r <= rankOf(codes, 'HEIGHT', me.prefHeightMax);
  }
  const wanted = me[PREF_ITEMS.find((p) => p.value === item).key] ?? [];
  const v = other[OWN_FIELD[item]];
  if (Array.isArray(v)) return v.some((x) => wanted.includes(x));
  return v != null && wanted.includes(v);
}

/**
 * me의 선호를 other가 얼마나 만족하나
 * @returns {{ score: number, hits: string[] }} hits: 맞은 항목 이름(우선순위 순)
 */
export function fitScore(me, other, codes) {
  const pr = me.priorities ?? [];
  let total = 0;
  let got = 0;
  const hits = [];
  const items = [...pr, ...PREF_ITEMS.map((p) => p.value).filter((v) => !pr.includes(v))];
  for (const item of items) {
    if (!prefIsSet(me, item)) continue;
    const i = pr.indexOf(item);
    const w = i >= 0 ? PRIORITY_WEIGHTS[i] : EXTRA_WEIGHT;
    total += w;
    if (satisfies(me, other, item, codes)) {
      got += w;
      hits.push(PREF_ITEMS.find((p) => p.value === item).text);
    }
  }
  return { score: total ? Math.round((got / total) * 100) : 50, hits };
}

/** 두 사람 사이에 매칭이 가능한가 (상태·진행 중 매칭은 따로 본다) */
export function isEligiblePair(a, b) {
  if (a.id === b.id || a.gender === b.gender) return false;
  if (avoids(a, b) || avoids(b, a)) return false;
  const aAge = ageOf(a.birthYear);
  const bAge = ageOf(b.birthYear);
  return inPrefAge(bAge, a) || inPrefAge(aAge, b);
}

/** 후보에서 빼는 사람 — 진행 중인 매칭 + 하트 맞교환 승인 대기 */
export const busyIds = (matches) =>
  new Set(matches.filter((m) => BUSY_MATCH_STATUS.includes(m.status)).flatMap((m) => [m.aId, m.bId]));
/** 본인 화면이 '매칭 중'인 사람 — 진행 중인 매칭만 (승인 대기는 본인에게 '매칭 대기 중'으로 보인다) */
export const activeIds = (matches) =>
  new Set(matches.filter((m) => ACTIVE_MATCH_STATUS.includes(m.status)).flatMap((m) => [m.aId, m.bId]));

/**
 * 후보 목록 (점수 높은 순)
 * @param {object} opt.exclude 추가로 뺄 신청자 id Set (이미 본 후보, 하트 보낸 상대 등)
 * @param {boolean} opt.recommendableOnly 일일 후보처럼 접수·검토 중인 신청자만
 */
export function scoreCandidates(target, pool, matches, codes, { exclude = new Set(), recommendableOnly = false, limit = 15 } = {}) {
  const busy = busyIds(matches);
  const pairedBefore = new Set(
    matches
      .filter((m) => m.aId === target.id || m.bId === target.id)
      .map((m) => (m.aId === target.id ? m.bId : m.aId)),
  );
  const tRegion = findCode(codes, 'CAMPUS', target.campus)?.attr;
  const out = [];

  for (const c of pool) {
    if (exclude.has(c.id) || busy.has(c.id) || pairedBefore.has(c.id)) continue;
    // 관리자 추천에서도 커플 완료자는 뺀다 (예전: 매칭 완료·보류만 빼서 커플 완료자가 추천에 떴다)
    if (recommendableOnly ? !RECOMMENDABLE_STATUS.includes(c.status) : ['MATCHED', 'HOLD', 'COUPLED'].includes(c.status)) continue;
    if (!isEligiblePair(target, c)) continue;

    const mine = fitScore(target, c, codes);
    const theirs = fitScore(c, target, codes);
    // 진지한 만남 여부가 같으면 +6, 다르면 -10 (서로 기대가 다르면 실망이 크다)
    const seriousAdj = target.serious && c.serious ? (target.serious === c.serious ? 6 : -10) : 0;
    const score = Math.max(0, Math.min(100, Math.round((mine.score + theirs.score) / 2) + seriousAdj));
    const reasons = [];
    if (mine.hits.length) reasons.push(`내 선호 일치 · ${mine.hits.slice(0, 4).join(', ')}`);
    reasons.push(`상대 선호 ${theirs.score}% 맞음`);
    const common = target.hobbies.filter((h) => c.hobbies.includes(h));
    if (common.length) reasons.push(`취미 ${common.length}개 겹침`);
    const near = target.campus && c.campus && (target.campus === c.campus || (tRegion && tRegion === findCode(codes, 'CAMPUS', c.campus)?.attr));
    if (near) reasons.push(target.campus === c.campus ? '같은 캠퍼스' : '가까운 캠퍼스');
    if (seriousAdj > 0) reasons.push(target.serious === 'Y' ? '둘 다 진지한 만남' : '둘 다 가볍게 시작');
    if (seriousAdj < 0) reasons.push('만남에 대한 생각이 다름');

    // 동점이면 가까운 캠퍼스 → 겹치는 취미 순
    const tie = (near ? 2 : 0) + Math.min(common.length, 3) * 0.1;
    out.push({ applicant: c, age: ageOf(c.birthYear), score, myScore: mine.score, theirScore: theirs.score, reasons, tie });
  }

  return out.sort((x, y) => y.score - x.score || y.tie - x.tie).slice(0, limit);
}

// ── 잘 맞는 부분 서술 (후보 카드) ─────────────────────────
const PHRASE = {
  AGE: '나이 차이', AGEGAP: '나이 궁합', HEIGHT: '키 취향', DIVISION: '일하는 세계', FACE: '첫인상 취향', HOBBY: '주말을 보내는 방식',
  DRINKING: '술자리의 온도', MBTI: '대화의 결', RELIGION: '삶의 가치관', SMOKING: '생활 습관', BODY: '서로의 이상형',
};
const josa = (w, a, b) => {
  const c = w.charCodeAt(w.length - 1) - 0xac00;
  return c >= 0 && c < 11172 && c % 28 !== 0 ? a : b;
};
const TEXT_TO_ITEM = Object.fromEntries(PREF_ITEMS.map((p) => [p.text, p.value]));

/**
 * 두 사람이 '어떤 부분이 잘 맞는지'를 한 문장으로 — 서로의 선호를 함께 만족하는 항목을 우선한다
 * @returns {{ note: string, points: string[] }}
 */
export function matchStory(me, other, codes) {
  const mine = fitScore(me, other, codes).hits.map((t) => TEXT_TO_ITEM[t]);
  const theirs = new Set(fitScore(other, me, codes).hits.map((t) => TEXT_TO_ITEM[t]));
  const both = mine.filter((i) => theirs.has(i) && i !== 'AGE');
  const pick = [...new Set([...both, ...mine.filter((i) => i !== 'AGE')])].slice(0, 2).map((i) => PHRASE[i]);
  const common = me.hobbies.filter((h) => other.hobbies.includes(h));
  if (!pick.includes(PHRASE.HOBBY) && common.length && pick.length < 2) pick.push(PHRASE.HOBBY);
  if (me.serious && me.serious === other.serious && pick.length < 2) pick.push('만남을 대하는 마음');

  let note;
  if (pick.length >= 2) note = `${pick[0]}${josa(pick[0], '과', '와')} ${pick[1]}${josa(pick[1], '이', '가')} 잘 맞아요`;
  else if (pick.length === 1) note = `${pick[0]}${josa(pick[0], '이', '가')} 잘 맞아요`;
  else if (mine.includes('AGE')) note = '서로 바라던 나이대예요';
  else note = '서로에게 새로운 세계를 보여줄 조합이에요';

  const points = [];
  if (both.length) points.push(`서로의 선호가 함께 맞는 부분 ${both.length}가지`);
  if (common.length) points.push(`같은 취미 ${common.length}개`);
  if (me.serious && me.serious === other.serious) points.push(me.serious === 'Y' ? '둘 다 진지한 만남을 원해요' : '둘 다 가볍게 시작하고 싶어해요');
  return { note, points };
}
