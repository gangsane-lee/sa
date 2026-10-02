/**
 * 매칭 후보 추천 (점수 0~100)
 * mock 전용이 아니라 서버의 /admin/applicants/:id/candidates 가 그대로 옮겨 쓸 로직이다.
 *
 * 1) 제외 조건 — 하나라도 걸리면 후보에서 뺀다
 *    같은 성별 / 매칭 완료·보류 상태 / 이미 진행 중인 매칭이 있음 / 예전에 맺어줬던 상대
 *    서로의 '매칭 제외 범위'(같은 팀·같은 사업부) / 비흡연 선호 위반 / 양쪽 모두 선호 나이 밖
 * 2) 가점 — 선호 나이(40) 취미(24) 근무지(12) 첫 만남 방식(8) 근무 형태(6) 음주(6) MBTI(4)
 */
import { WORK_SITE_MAP, ACTIVE_MATCH_STATUS } from '@/constants/codes';
import { ageOf } from '@/utils/applicationRules';

const norm = (s = '') => s.replace(/\s/g, '').toLowerCase();

/** a가 b를 '피하고 싶은 범위'로 지정했는가 */
function avoids(a, b) {
  if (a.avoidScope === 'DIVISION') return a.division === b.division;
  if (a.avoidScope === 'TEAM') return a.division === b.division && norm(a.dept) === norm(b.dept);
  return false;
}

const inPrefAge = (age, who) => age >= who.prefAgeMin && age <= who.prefAgeMax;
const smokingOk = (who, other) => who.prefSmoking !== 'NON' || other.smoking === 'NON';

export function scoreCandidates(target, pool, matches) {
  const busy = new Set(
    matches.filter((m) => ACTIVE_MATCH_STATUS.includes(m.status)).flatMap((m) => [m.aId, m.bId]),
  );
  const pairedBefore = new Set(
    matches
      .filter((m) => m.aId === target.id || m.bId === target.id)
      .map((m) => (m.aId === target.id ? m.bId : m.aId)),
  );
  const tAge = ageOf(target.birthYear);
  const out = [];

  for (const c of pool) {
    if (c.id === target.id || c.gender === target.gender) continue;
    if (c.status === 'MATCHED' || c.status === 'HOLD') continue;
    if (busy.has(c.id) || pairedBefore.has(c.id)) continue;
    if (avoids(target, c) || avoids(c, target)) continue;
    if (!smokingOk(target, c) || !smokingOk(c, target)) continue;

    const cAge = ageOf(c.birthYear);
    const iWant = inPrefAge(cAge, target);
    const theyWant = inPrefAge(tAge, c);
    if (!iWant && !theyWant) continue;

    let score = 0;
    const reasons = [];

    if (iWant && theyWant) {
      score += 40;
      reasons.push('서로 선호 나이 일치');
    } else {
      score += 15;
      reasons.push(iWant ? '상대 쪽 선호 나이와 차이' : '본인 선호 나이와 차이');
    }

    const common = target.hobbies.filter((h) => c.hobbies.includes(h));
    if (common.length) {
      score += Math.min(common.length, 3) * 8;
      reasons.push(`취미 ${common.length}개 겹침 · ${common.slice(0, 3).join(', ')}`);
    }

    if (target.workSite === c.workSite) {
      score += 12;
      reasons.push('같은 근무지');
    } else {
      const r = WORK_SITE_MAP[target.workSite]?.region;
      if (r && r === WORK_SITE_MAP[c.workSite]?.region) {
        score += 8;
        reasons.push('가까운 근무지');
      }
    }

    if (target.meetingStyle === c.meetingStyle || target.meetingStyle === 'ANY' || c.meetingStyle === 'ANY') {
      score += 8;
      reasons.push('첫 만남 방식 맞음');
    }

    if (target.workPattern === c.workPattern) {
      score += 6;
      reasons.push(c.workPattern === 'SHIFT' ? '둘 다 교대 근무' : '근무 형태 같음');
    }

    if (target.drinking === c.drinking) {
      score += 6;
      reasons.push('음주 스타일 비슷');
    }

    if (target.mbti && c.mbti && [...target.mbti].filter((ch, i) => c.mbti[i] === ch).length >= 2) {
      score += 4;
      reasons.push(`MBTI ${target.mbti} · ${c.mbti}`);
    }

    out.push({ applicant: c, age: cAge, score: Math.min(score, 100), reasons });
  }

  return out.sort((x, y) => y.score - x.score).slice(0, 15);
}
