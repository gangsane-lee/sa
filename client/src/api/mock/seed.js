/**
 * mock 모드 가비지 데이터 (삼성전자 DS부문 기준의 가상 인물)
 * - 고정 시드 난수라 매번 같은 데이터가 만들어진다
 * - 실제 인물·연락처와 무관하며, 메일은 수신 불가능한 .test 도메인을 쓴다
 * - 운영 빌드(VITE_API_MODE=server)에는 포함되지 않는다
 */
import {
  RELIGIONS, DRINKING, MBTIS, HOBBIES, PERSONALITIES, IDEAL_KEYWORDS, MEETING_STYLES,
} from '@/constants/codes';
import { THIS_YEAR } from '@/utils/applicationRules';
import { maskName } from '@/utils/format';
import { scoreCandidates } from './matching.js';

/** 개발용 테스트 계정 (README의 '테스트 계정' 표와 같게 유지) */
export const MOCK_PASSWORD = 'sayeon1234';
export const MOCK_ADMIN_PASSWORD = 'admin!sayeon';
export const TEST_ACCOUNTS = {
  NEW: '20230001', // 아직 신청 안 함
  APPLIED: '20190042', // 신청 완료(검토 중)
  RETIRED: '20160077', // 퇴직자 — 로그인 거절 확인용
  MANAGER: '20150003', // 매칭 담당자(인사팀)
};

function mulberry32(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SURNAMES = [
  ['김', 'kim'], ['이', 'lee'], ['박', 'park'], ['최', 'choi'], ['정', 'jung'],
  ['강', 'kang'], ['조', 'cho'], ['윤', 'yoon'], ['장', 'jang'], ['임', 'lim'],
  ['한', 'han'], ['오', 'oh'], ['서', 'seo'], ['신', 'shin'], ['권', 'kwon'],
];
const GIVEN = {
  M: [
    ['도윤', 'doyun'], ['서준', 'seojun'], ['하준', 'hajun'], ['민준', 'minjun'], ['지호', 'jiho'],
    ['준우', 'junwoo'], ['현우', 'hyunwoo'], ['건우', 'gunwoo'], ['우진', 'woojin'], ['선우', 'sunwoo'],
    ['승현', 'seunghyun'], ['재원', 'jaewon'], ['태윤', 'taeyun'], ['시우', 'siwoo'], ['유찬', 'yuchan'],
    ['정훈', 'junghoon'], ['동현', 'donghyun'], ['성민', 'sungmin'], ['지훈', 'jihoon'], ['영재', 'youngjae'],
  ],
  F: [
    ['서연', 'seoyeon'], ['지우', 'jiwoo'], ['하은', 'haeun'], ['수아', 'sua'], ['지민', 'jimin'],
    ['예린', 'yerin'], ['다은', 'daeun'], ['채원', 'chaewon'], ['소윤', 'soyun'], ['유나', 'yuna'],
    ['민서', 'minseo'], ['가은', 'gaeun'], ['서윤', 'seoyun'], ['하린', 'harin'], ['은비', 'eunbi'],
    ['지수', 'jisoo'], ['나연', 'nayeon'], ['혜원', 'hyewon'], ['수빈', 'subin'], ['예지', 'yeji'],
  ],
};

const DEPTS = {
  MEMORY: ['DRAM설계팀', 'Flash설계팀', 'DRAM PE팀', '메모리 상품기획팀', '솔루션개발팀', '메모리 제조기술팀', '메모리 품질보증팀'],
  LSI: ['SoC설계팀', '이미지센서개발팀', '모뎀개발팀', 'DDI개발팀', 'LSI 상품기획팀', 'LSI 마케팅팀'],
  FOUNDRY: ['공정기술팀', '디자인플랫폼팀', '파운드리 고객지원팀', '파운드리 사업기획팀', '수율향상팀', '파운드리 품질팀'],
  COMMON: ['인사팀', '반도체연구소', '설비기술팀', '환경안전팀', '구매팀', '경영지원팀', '인프라기술팀', '패키지개발팀'],
};
/** 사업부별 근무지 분포 [값, 가중치] */
const SITES = {
  MEMORY: [['HWASEONG', 35], ['PYEONGTAEK', 35], ['GIHEUNG', 20], ['ONYANG', 10]],
  LSI: [['GIHEUNG', 60], ['HWASEONG', 30], ['SEOCHO', 10]],
  FOUNDRY: [['GIHEUNG', 30], ['HWASEONG', 40], ['PYEONGTAEK', 30]],
  COMMON: [['GIHEUNG', 35], ['HWASEONG', 20], ['PYEONGTAEK', 15], ['ONYANG', 10], ['CHEONAN', 10], ['SEOCHO', 5], ['SUWON', 5]],
};
const RESIDENCES = {
  GIHEUNG: ['용인 기흥구', '수원 영통구', '화성 동탄', '용인 수지구'],
  HWASEONG: ['화성 동탄', '수원 영통구', '오산', '화성 병점'],
  PYEONGTAEK: ['평택 고덕동', '평택 비전동', '화성 동탄', '오산'],
  ONYANG: ['아산 배방읍', '아산 탕정면', '천안 불당동'],
  CHEONAN: ['천안 불당동', '천안 서북구', '아산 배방읍'],
  SUWON: ['수원 영통구', '수원 권선구', '용인 수지구'],
  SEOCHO: ['서울 서초구', '서울 강남구', '서울 송파구', '성남 분당구'],
};

const INTROS = [
  '평일엔 화성캠퍼스에서 공정 데이터를 들여다보고, 주말엔 동탄 호수공원을 달려요. 맛있는 국밥집을 찾으면 꼭 누군가에게 알려주고 싶어지는 사람이에요.',
  '회사에서는 꼼꼼하다는 말을 자주 듣지만 여행 계획은 의외로 즉흥적이에요. 같이 길을 잃어도 웃을 수 있는 분이면 좋겠어요.',
  '퇴근 후 요리하는 게 소소한 낙이에요. 새로운 레시피를 시도해 보고, 맛있게 먹어줄 사람을 찾고 있어요.',
  '책 읽고 전시 보는 걸 좋아해요. 조용한 카페에서 각자 책을 읽다가 좋은 문장이 나오면 서로 읽어주는 데이트가 로망이에요.',
  '아침엔 사내 피트니스, 주말엔 산에 가요. 건강하게 오래 함께 웃을 수 있는 관계를 만들고 싶어요.',
  '말수가 많진 않지만 잘 들어주는 편이에요. 대화가 편안하게 이어지는 분을 만나고 싶어요.',
  '강아지 한 마리와 살고 있어요. 산책 메이트가 되어주실 분이라면 더 좋고요. 다정함이 제일 중요하다고 생각해요.',
  '입사하고 정신없이 달려오다 보니 어느새 연애 세포가 잠들었어요. 사소한 하루를 나눌 수 있는 사람을 만나고 싶어요.',
  '캠핑과 드라이브를 좋아해요. 별 보러 훌쩍 떠나곤 하는데, 조수석이 비어 있어서 용기 내 신청했어요.',
  '웃음이 많고 리액션이 좋은 편이에요. 맛집 리스트가 꽤 길어서 같이 하나씩 지워나갈 분을 찾아요.',
  '차분하고 계획적인 편이라 약속 시간은 꼭 지켜요. 서로를 존중하며 천천히 알아가는 관계를 원해요.',
  '와인 한 잔 하면서 하루 이야기를 나누는 시간을 좋아해요. 진지한 이야기도 가벼운 농담도 편하게 나눌 수 있는 분이면 좋겠어요.',
  '사진 찍는 걸 좋아해서 주말마다 동네 골목을 걸어요. 소소한 풍경에서 행복을 찾는 분과 함께 걷고 싶어요.',
  '실내 데이트파지만 좋은 사람과 함께라면 어디든 나갈 준비가 되어 있어요. 영화와 보드게임을 좋아해요.',
  '통근버스 창밖을 보며 음악 듣는 시간을 좋아해요. 좋아하는 노래를 서로 추천해 줄 수 있는 분이면 좋겠어요.',
];
const SHIFT_INTRO = '교대 근무라 평일 낮 시간이 자유로운 편이에요. 한적한 평일 카페 데이트를 같이 즐길 분이면 좋겠어요.';

const MESSAGES = [
  '키는 크게 상관없어요. 대화가 잘 통하는 분이면 좋겠어요.',
  '같은 그룹 분은 조금 부담스러워요.',
  '교대 근무라 일정은 미리 맞추는 게 편해요.',
  '천천히 알아가고 싶어요. 첫 만남은 점심이 편해요.',
  '비흡연자분이면 정말 좋겠어요!',
  '처음이라 떨리네요. 잘 부탁드려요.',
  '나이는 조금 유연하게 봐주셔도 괜찮아요.',
  '평택이나 화성 근무하시는 분이면 만나기 편할 것 같아요.',
];
const ADMIN_MEMOS = ['10/1 통화 — 주말 일정 선호', '자기소개 보완 요청 예정', '이전 매칭 불발 후 재신청', '교대 근무 일정 확인 필요'];

const DAY = 86400000;

export function createSeed() {
  const rnd = mulberry32(20261003);
  const now = Date.now();
  const int = (min, max) => min + Math.floor(rnd() * (max - min + 1));
  const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
  const chance = (p) => rnd() < p;
  const weighted = (pairs) => {
    let r = rnd() * pairs.reduce((s, [, w]) => s + w, 0);
    for (const [v, w] of pairs) if ((r -= w) < 0) return v;
    return pairs[0][0];
  };
  const sample = (arr, n) => {
    const pool = [...arr];
    const out = [];
    while (out.length < n && pool.length) out.push(pool.splice(Math.floor(rnd() * pool.length), 1)[0]);
    return out;
  };
  const iso = (t) => new Date(t).toISOString();

  // ── 임직원 (인사 정보) ─────────────────────────────────
  const usedEmails = new Set();
  const emailOf = (given, sur) => {
    let base = `${given}.${sur}`;
    let mail = `${base}@samsung.test`;
    for (let i = 2; usedEmails.has(mail); i++) mail = `${base}${i}@samsung.test`;
    usedEmails.add(mail);
    return mail;
  };
  const clOf = (age) => {
    if (age < 30) return chance(0.15) ? 'CL1' : 'CL2';
    if (age < 36) return chance(0.5) ? 'CL2' : 'CL3';
    if (age < 41) return chance(0.8) ? 'CL3' : 'CL4';
    return chance(0.5) ? 'CL3' : 'CL4';
  };

  const employees = [
    { empNo: TEST_ACCOUNTS.MANAGER, name: '정지원', gender: 'F', birthYear: 1986, division: 'COMMON', dept: '인사팀', careerLevel: 'CL3', workSite: 'GIHEUNG', email: emailOf('jiwon', 'jung'), retired: false },
    { empNo: TEST_ACCOUNTS.NEW, name: '김하늘', gender: 'F', birthYear: 1997, division: 'MEMORY', dept: 'DRAM설계팀', careerLevel: 'CL2', workSite: 'HWASEONG', email: emailOf('haneul', 'kim'), retired: false },
    { empNo: TEST_ACCOUNTS.APPLIED, name: '이도윤', gender: 'M', birthYear: 1993, division: 'FOUNDRY', dept: '공정기술팀', careerLevel: 'CL2', workSite: 'PYEONGTAEK', email: emailOf('doyun', 'lee'), retired: false },
    { empNo: TEST_ACCOUNTS.RETIRED, name: '박서진', gender: 'M', birthYear: 1990, division: 'LSI', dept: 'SoC설계팀', careerLevel: 'CL3', workSite: 'GIHEUNG', email: emailOf('seojin', 'park'), retired: true },
  ];
  const usedNames = new Set(employees.map((e) => e.name));
  const usedEmpNos = new Set(employees.map((e) => e.empNo));

  for (let i = 0; i < 60; i++) {
    const gender = i % 2 === 0 ? 'M' : 'F';
    let sur, given, name;
    do {
      sur = pick(SURNAMES);
      given = pick(GIVEN[gender]);
      name = sur[0] + given[0];
    } while (usedNames.has(name));
    usedNames.add(name);

    let empNo;
    do empNo = `${int(2012, 2025)}${String(int(1, 9999)).padStart(4, '0')}`;
    while (usedEmpNos.has(empNo));
    usedEmpNos.add(empNo);

    const birthYear = THIS_YEAR - int(25, 41);
    const division = weighted([['MEMORY', 35], ['FOUNDRY', 25], ['LSI', 20], ['COMMON', 20]]);
    employees.push({
      empNo,
      name,
      gender,
      birthYear,
      division,
      dept: pick(DEPTS[division]),
      careerLevel: clOf(THIS_YEAR - birthYear),
      workSite: weighted(SITES[division]),
      email: emailOf(given[1], sur[1]),
      retired: false,
    });
  }

  // ── 신청서 ─────────────────────────────────────────────
  const makeApplication = (emp, id, createdAt) => {
    const age = THIS_YEAR - emp.birthYear;
    const male = emp.gender === 'M';
    const prefAgeMin = Math.max(20, male ? age - int(4, 7) : age - int(0, 3));
    const prefAgeMax = Math.min(55, male ? age + int(0, 3) : age + int(3, 7));
    const shiftish = /제조|PE|수율|설비/.test(emp.dept);
    const workPattern = shiftish && chance(0.6) ? 'SHIFT' : chance(0.3) ? 'FLEX' : 'DAY';
    const smoking = weighted([['NON', 76], ['E_CIG', 13], ['SMOKER', 11]]);
    const agreeSensitive = chance(0.4);
    const updatedAt = chance(0.3) ? Math.min(now, createdAt + int(1, 5) * DAY) : createdAt;

    return {
      id,
      empNo: emp.empNo,
      name: emp.name,
      gender: emp.gender,
      birthYear: emp.birthYear,
      division: emp.division,
      dept: emp.dept,
      careerLevel: emp.careerLevel,
      workSite: emp.workSite,
      workPattern,
      phone: `010-${int(2000, 9899)}-${String(int(0, 9999)).padStart(4, '0')}`,
      email: emp.email,

      height: male ? int(168, 186) : int(154, 172),
      bodyType: pick(male ? ['SLENDER', 'AVERAGE', 'TONED', 'BUILT'] : ['SLIM', 'SLENDER', 'AVERAGE', 'TONED']),
      residence: pick(RESIDENCES[emp.workSite] ?? RESIDENCES.GIHEUNG),
      education: chance(0.85) ? weighted([['UNIV', 55], ['MASTER', 25], ['DOCTOR', 8], ['COLLEGE', 7], ['HIGH', 5]]) : null,
      smoking,
      drinking: pick(DRINKING).value,
      mbti: chance(0.8) ? pick(MBTIS).value : null,
      religion: agreeSensitive ? pick(RELIGIONS).value : null,
      agreeSensitive,
      hobbies: sample(HOBBIES, int(2, 5)),
      personality: sample(PERSONALITIES, int(1, 3)),
      intro: workPattern === 'SHIFT' && chance(0.6) ? SHIFT_INTRO : pick(INTROS),

      prefAgeMin,
      prefAgeMax,
      prefKeywords: sample(IDEAL_KEYWORDS, int(2, 4)),
      prefSmoking: smoking === 'NON' && chance(0.6) ? 'NON' : 'ANY',
      meetingStyle: pick(MEETING_STYLES).value,
      avoidScope: weighted([['TEAM', 60], ['DIVISION', 25], ['NONE', 15]]),
      messageToManager: chance(0.5) ? pick(MESSAGES) : '',

      agreePrivacy: true,
      agreeShare: true,
      agreedAt: iso(createdAt),
      status: weighted([['RECEIVED', 45], ['REVIEWING', 45], ['HOLD', 10]]),
      adminMemo: chance(0.25) ? pick(ADMIN_MEMOS) : '',
      createdAt: iso(createdAt),
      updatedAt: iso(updatedAt),
    };
  };

  const applicants = [];
  let applicantSeq = 0;
  const candidates = employees.filter((e) => !e.retired && !Object.values(TEST_ACCOUNTS).includes(e.empNo));
  for (const emp of sample(candidates, 39)) {
    const createdAt = now - int(0, 45) * DAY - int(0, 23) * 3600000;
    applicants.push(makeApplication(emp, ++applicantSeq, createdAt));
  }
  // 테스트 계정 '이도윤': 3일 전 신청, 검토 중
  const doyun = makeApplication(employees.find((e) => e.empNo === TEST_ACCOUNTS.APPLIED), ++applicantSeq, now - 3 * DAY);
  Object.assign(doyun, {
    status: 'REVIEWING', workPattern: 'FLEX', smoking: 'NON', prefSmoking: 'ANY', prefAgeMin: 27, prefAgeMax: 34,
    hobbies: ['러닝', '맛집 탐방', '캠핑'], meetingStyle: 'DINNER', avoidScope: 'TEAM', adminMemo: '',
    intro: '평일엔 평택캠퍼스에서 공정 조건을 잡고, 주말엔 캠핑 장비를 챙겨 떠나요. 불멍하면서 이런저런 이야기 나눌 수 있는 분이면 좋겠어요.',
  });
  applicants.push(doyun);
  applicants.sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  // ── 매칭 내역: 추천 1순위끼리 실제로 맺어 둔다 ─────────────
  const matches = [];
  let matchSeq = 0;
  const plan = ['MET', 'ACCEPTED', 'PROPOSED', 'PROPOSED', 'DECLINED', 'ACCEPTED', 'PROPOSED'];
  const byId = (id) => applicants.find((a) => a.id === id);
  for (const a of sample(applicants.filter((x) => x.id !== doyun.id && x.status !== 'HOLD'), 20)) {
    if (matches.length >= plan.length) break;
    if (matches.some((m) => m.status !== 'DECLINED' && (m.aId === a.id || m.bId === a.id))) continue;
    const top = scoreCandidates(a, applicants.filter((x) => x.id !== doyun.id), matches)[0];
    if (!top) continue;
    const status = plan[matches.length];
    const createdAt = Math.max(Date.parse(a.createdAt), Date.parse(top.applicant.createdAt)) + int(1, 4) * DAY;
    const at = iso(Math.min(createdAt, now - 3600000));
    matches.push({
      id: ++matchSeq, aId: a.id, bId: top.applicant.id, score: top.score, status,
      memo: status === 'DECLINED' ? '한쪽에서 정중히 거절' : '', createdBy: '정지원', createdAt: at, updatedAt: at,
    });
    const next = status === 'PROPOSED' ? 'MATCHING' : status === 'DECLINED' ? 'REVIEWING' : 'MATCHED';
    a.status = next;
    byId(top.applicant.id).status = next;
  }

  // ── 관리자 열람 기록 ─────────────────────────────────────
  const manager = employees[0];
  const ip = () => `10.${int(20, 90)}.${int(1, 250)}.${int(2, 250)}`;
  const target = (a) => `#${a.id} ${maskName(a.name)}`;
  const managerIp = ip();
  const logs = [];
  const log = (daysAgo, action, tgt = '', detail = '', actor = manager, addr = managerIp) =>
    logs.push({ at: iso(now - daysAgo * DAY), actorEmpNo: actor.empNo, actorName: actor.name, action, target: tgt, detail, ip: addr });

  const someone = employees.find((e) => e.empNo !== manager.empNo && !e.retired && e.empNo !== TEST_ACCOUNTS.NEW);
  log(9.2, 'ADMIN_ENTER');
  log(9.19, 'VIEW_APPLICANT', target(applicants[2]));
  log(9.18, 'VIEW_APPLICANT', target(applicants[5]));
  log(9.15, 'STATUS_CHANGE', '3명', '접수 → 검토 중');
  log(9.1, 'ADMIN_EXIT');
  log(6.4, 'ADMIN_ENTER_FAIL', '', '1회째 실패', someone, ip());
  log(5.3, 'ADMIN_ENTER');
  for (const m of matches.slice(0, 3)) log(5.25, 'MATCH_CREATE', `#${m.aId} ↔ #${m.bId}`, `추천 점수 ${m.score}`);
  log(5.2, 'REVEAL_PII', '신청자 목록', '연락처 전체 표시');
  log(5.18, 'EXPORT', '신청자 목록', `${applicants.length}명 · 연락처 가림`);
  log(5.1, 'ADMIN_EXIT');
  log(1.3, 'ADMIN_ENTER');
  log(1.28, 'UPDATE_APPLICANT', target(applicants[8]), '변경 항목: 상태, 관리 메모');
  log(1.2, 'ADMIN_EXIT');
  const auditLogs = logs.reverse().map((l, i) => ({ id: logs.length - i, ...l }));

  return {
    version: 2,
    employees,
    applicants,
    matches,
    auditLogs,
    seq: { applicant: applicantSeq, match: matchSeq, audit: auditLogs.length },
  };
}
