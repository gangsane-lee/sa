/**
 * mock 모드 가비지 데이터 (삼성전자 DS부문 기준의 가상 인물)
 * - 고정 시드 난수라 매번 같은 데이터가 만들어진다
 * - 실제 인물·연락처와 무관하며, 메일은 수신 불가능한 .test 도메인을 쓴다
 * - 개발 모드(npm run dev)에서만 쓰인다. 빌드(npm run build)에는 포함되지 않는다
 */
import { DEFAULT_CODES } from '@shared/constants/defaultCodes.js';
import { PREF_ITEMS, MAX_PRIORITIES, DEFAULT_SETTINGS } from '@shared/constants/codes.js';
import { THIS_YEAR, prefIsSet } from '@shared/utils/applicationRules.js';
import { initials } from '@shared/utils/format.js';
import { nicknameAt, NICKNAME_POOL_SIZE } from '@shared/utils/nickname.js';
import { scoreCandidates } from '@shared/api/core/matching.js';

/** 테스트 계정은 accounts.js 한 곳에서 관리한다 (여기서는 다시 내보내기만) */
import { TEST_ACCOUNTS, ADMIN_ACCOUNTS } from './accounts.js';
export { MOCK_PASSWORD, MOCK_ADMIN_PASSWORD, TEST_ACCOUNTS } from './accounts.js';

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

const TEAMS = {
  MEMORY: ['DRAM설계팀', 'Flash설계팀', 'DRAM PE팀', '메모리 상품기획팀', '솔루션개발팀', '메모리 제조기술팀', '메모리 품질보증팀'],
  LSI: ['SoC설계팀', '이미지센서개발팀', '모뎀개발팀', 'DDI개발팀', 'LSI 상품기획팀', 'LSI 마케팅팀'],
  FOUNDRY: ['공정기술팀', '디자인플랫폼팀', '파운드리 고객지원팀', '파운드리 사업기획팀', '수율향상팀', '파운드리 품질팀'],
  COMMON: ['인사팀', '반도체연구소', '설비기술팀', '환경안전팀', '구매팀', '경영지원팀', '인프라기술팀', '패키지개발팀'],
};
/** 사업부별 캠퍼스 분포 [값, 가중치] */
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

const COMMENTS = [
  '평일엔 공정 데이터를 들여다보고, 주말엔 동탄 호수공원을 달려요. 맛있는 국밥집을 찾으면 꼭 누군가에게 알려주고 싶어지는 사람이에요.',
  '회사에서는 꼼꼼하다는 말을 자주 듣지만 여행 계획은 의외로 즉흥적이에요. 같이 길을 잃어도 웃을 수 있는 분이면 좋겠어요.',
  '퇴근 후 요리하는 게 소소한 낙이에요. 새로운 레시피를 시도해 보고, 맛있게 먹어줄 사람을 찾고 있어요.',
  '책 읽고 전시 보는 걸 좋아해요. 조용한 카페에서 각자 책을 읽다가 좋은 문장이 나오면 서로 읽어주는 데이트가 로망이에요.',
  '아침엔 사내 피트니스, 주말엔 산에 가요. 건강하게 오래 함께 웃을 수 있는 관계를 만들고 싶어요.',
  '말수가 많진 않지만 잘 들어주는 편이에요. 대화가 편안하게 이어지는 분을 만나고 싶어요.',
  '강아지 한 마리와 살고 있어요. 산책 메이트가 되어주실 분이라면 더 좋고요.',
  '캠핑과 드라이브를 좋아해요. 별 보러 훌쩍 떠나곤 하는데, 조수석이 비어 있어서 용기 내 신청했어요.',
  '웃음이 많고 리액션이 좋은 편이에요. 맛집 리스트가 꽤 길어서 같이 하나씩 지워나갈 분을 찾아요.',
  '통근버스 창밖을 보며 음악 듣는 시간을 좋아해요. 좋아하는 노래를 서로 추천해 줄 수 있는 분이면 좋겠어요.',
  '',
  '',
];
const ADMIN_MEMOS = ['10/1 통화 — 주말 일정 선호', '코멘트 보완 요청 예정', '이전 매칭 불발 후 재신청', '교대 근무 일정 확인 필요'];

const DAY = 86400000;
const codeValues = (group) => DEFAULT_CODES[group].map((c) => c.value);

export function createSeed() {
  const rnd = mulberry32(20261007);
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
  const codes = structuredClone(DEFAULT_CODES);
  const HEIGHTS = codeValues('HEIGHT');
  const heightIdx = (cm) => (cm < 150 ? 0 : cm >= 190 ? HEIGHTS.length - 1 : 1 + (Math.floor(cm / 10) - 15) * 3 + Math.min(2, Math.floor((cm % 10) / 3.4)));

  // ── 임직원 (인사 정보 · 사내 계정) ─────────────────────────
  const used = new Set();
  const adIdOf = (given, sur) => {
    let id = `${given}.${sur}`;
    for (let i = 2; used.has(id); i++) id = `${given}.${sur}${i}`;
    used.add(id);
    return id;
  };
  const empNos = new Set();
  const empNoOf = () => {
    let n;
    do n = `${int(2012, 2025)}${String(int(1, 9999)).padStart(4, '0')}`;
    while (empNos.has(n));
    empNos.add(n);
    return n;
  };
  const person = (name, gender, year, division, team, given, sur, extra = {}) => {
    const adId = adIdOf(given, sur);
    return { empNo: empNoOf(), adId, name, gender, birthYear: year, division, team, email: `${adId}@samsung.test`, retired: false, ...extra };
  };

  const employees = [
    person('정지원', 'F', 1986, 'COMMON', '인사팀', 'jiwon', 'jung'),
    person('김하늘', 'F', 1997, 'MEMORY', 'DRAM설계팀', 'haneul', 'kim'),
    person('이도윤', 'M', 1993, 'FOUNDRY', '공정기술팀', 'doyun', 'lee'),
    person('박서진', 'M', 1990, 'LSI', 'SoC설계팀', 'seojin', 'park', { retired: true }),
    person('한사연', 'M', 1993, 'FOUNDRY', '수율향상팀', 'sayeon', 'test'),
  ];
  const usedNames = new Set(employees.map((e) => e.name));
  for (let i = 0; i < 64; i++) {
    const gender = i % 2 === 0 ? 'M' : 'F';
    let sur, given, name;
    do {
      sur = pick(SURNAMES);
      given = pick(GIVEN[gender]);
      name = sur[0] + given[0];
    } while (usedNames.has(name));
    usedNames.add(name);
    const division = weighted([['MEMORY', 35], ['FOUNDRY', 25], ['LSI', 20], ['COMMON', 20]]);
    employees.push(person(name, gender, THIS_YEAR - int(25, 41), division, pick(TEAMS[division]), given[1], sur[1]));
  }

  // ── 신청서 ─────────────────────────────────────────────
  const prefPool = (group, n) => sample(codeValues(group), n);
  const usedNicks = new Set();
  const nick = () => {
    let n;
    do n = nicknameAt(int(0, NICKNAME_POOL_SIZE - 1));
    while (usedNicks.has(n));
    usedNicks.add(n);
    return n;
  };
  const BUILDING_NAMES = ['연구동', '사무동', '생산동(FAB)', '복지동', '부품동', 'R&D센터'];
  const makeApplication = (emp, id, createdAt) => {
    const year = emp.birthYear;
    const age = THIS_YEAR - year;
    const male = emp.gender === 'M';
    const campus = weighted(SITES[emp.division]);
    const smoking = weighted([['NON', 76], ['E_CIG', 13], ['SMOKER', 11]]);
    const agreeSensitive = chance(0.4);
    const updatedAt = chance(0.3) ? Math.min(now, createdAt + int(1, 5) * DAY) : createdAt;
    const cm = male ? int(166, 188) : int(153, 172);
    const hi = HEIGHTS.length - 1;

    const app = {
      id,
      empNo: emp.empNo,
      name: emp.name,
      nickname: nick(),
      serious: weighted([['Y', 65], ['N', 35]]),
      gender: emp.gender,
      birthYear: emp.birthYear, // 생년월일(월·일)은 저장하지 않는다
      heightBand: HEIGHTS[heightIdx(cm)],
      hobbies: prefPool('HOBBY', int(2, 5)),
      mbti: pick(codeValues('MBTI')),
      religion: agreeSensitive ? pick(codeValues('RELIGION')) : null,
      agreeSensitive,
      residence: chance(0.7) ? pick(RESIDENCES[campus] ?? RESIDENCES.GIHEUNG) : '',
      division: emp.division,
      team: emp.team,
      campus: chance(0.9) ? campus : null,
      building: null,
      comment: pick(COMMENTS),
      face: pick(codeValues('FACE')),
      body: pick(male ? ['SLENDER', 'AVERAGE', 'TONED', 'BUILT'] : ['SLIM', 'SLENDER', 'AVERAGE', 'TONED']),
      looks: weighted([['HIGH', 25], ['MID', 60], ['LOW', 15]]),
      drinking: pick(codeValues('DRINKING')),
      smoking,

      prefAgeMin: Math.max(19, male ? age - int(4, 7) : age - int(0, 3)),
      prefAgeMax: Math.min(60, male ? age + int(0, 3) : age + int(3, 7)),
      prefHeightMin: null,
      prefHeightMax: null,
      avoid: weighted([[['TEAM'], 50], [['TEAM', 'BUILDING'], 25], [['DIVISION'], 15], [[], 10]]),
      prefDivisions: chance(0.2) ? prefPool('DIVISION', 2) : [],
      prefFaces: chance(0.6) ? prefPool('FACE', int(2, 4)) : [],
      prefHobbies: chance(0.5) ? prefPool('HOBBY', int(2, 5)) : [],
      prefDrinking: chance(0.4) ? prefPool('DRINKING', 2) : [],
      prefMbtis: chance(0.3) ? prefPool('MBTI', int(3, 6)) : [],
      prefReligions: agreeSensitive && chance(0.3) ? prefPool('RELIGION', 2) : [],
      prefSmoking: smoking === 'NON' && chance(0.7) ? ['NON'] : [],
      prefBodies: chance(0.4) ? prefPool('BODY', int(2, 3)) : [],
      prefAgeGap: chance(0.5) ? sample(['OLDER', 'SAME', 'YOUNGER'], int(1, 2)) : [],
      priorities: [],

      agreePrivacy: true,
      agreeShare: true,
      agreedAt: iso(createdAt),
      status: weighted([['RECEIVED', 50], ['REVIEWING', 42], ['HOLD', 8]]),
      adminMemo: chance(0.2) ? pick(ADMIN_MEMOS) : '',
      createdAt: iso(createdAt),
      updatedAt: iso(updatedAt),
    };
    if (app.campus && chance(0.6)) app.building = pick(BUILDING_NAMES);
    if (chance(0.6)) {
      const lo = male ? int(1, 5) : int(5, 9);
      app.prefHeightMin = HEIGHTS[Math.min(lo, hi)];
      app.prefHeightMax = HEIGHTS[Math.min(lo + int(3, 6), hi)];
    }
    const settable = PREF_ITEMS.map((p) => p.value).filter((v) => prefIsSet(app, v));
    app.priorities = sample(settable, Math.min(settable.length, int(1, MAX_PRIORITIES)));
    return app;
  };

  const applicants = [];
  let applicantSeq = 0;
  const testIds = Object.values(TEST_ACCOUNTS);
  const pool = employees.filter((e) => !e.retired && !testIds.includes(e.adId));
  for (const emp of sample(pool, 46)) {
    const createdAt = now - int(0, 45) * DAY - int(0, 23) * 3600000;
    applicants.push(makeApplication(emp, ++applicantSeq, createdAt));
  }
  // 테스트 계정 '이도윤': 3일 전 신청
  const doyun = makeApplication(employees.find((e) => e.adId === TEST_ACCOUNTS.APPLIED), ++applicantSeq, now - 3 * DAY);
  Object.assign(doyun, {
    status: 'REVIEWING', smoking: 'NON', prefAgeMin: 26, prefAgeMax: 34, avoid: ['TEAM'],
    hobbies: ['HB01', 'HB10', 'HB08'], campus: 'PYEONGTAEK', building: '생산동(FAB)', adminMemo: '', nickname: '불멍캠퍼', serious: 'Y',
    prefFaces: ['PUPPY', 'RABBIT', 'CAT'], prefSmoking: ['NON'], prefHobbies: ['HB01', 'HB08', 'HB09'],
    priorities: ['AGE', 'SMOKING', 'FACE', 'HOBBY'],
    comment: '평일엔 평택캠퍼스에서 공정 조건을 잡고, 주말엔 캠핑 장비를 챙겨 떠나요. 불멍하면서 이런저런 이야기 나눌 수 있는 분이면 좋겠어요.',
  });
  applicants.push(doyun);
  // 만능 테스트 계정 '한사연': 신청 완료, 선호를 넓게 잡아 후보가 늘 나오게
  const master = makeApplication(employees.find((e) => e.adId === TEST_ACCOUNTS.MASTER), ++applicantSeq, now - 2 * DAY);
  Object.assign(master, {
    status: 'REVIEWING', smoking: 'NON', prefAgeMin: 24, prefAgeMax: 40, avoid: ['TEAM'], campus: 'HWASEONG', building: '사무동', nickname: '테스트사연', serious: 'Y',
    hobbies: ['HB01', 'HB10', 'HB14'], prefFaces: ['PUPPY', 'CAT', 'RABBIT', 'DEER'], prefSmoking: ['NON'], prefHobbies: [], prefMbtis: [],
    prefDivisions: [], prefBodies: [], prefAgeGap: [], prefDrinking: [], prefReligions: [], prefHeightMin: null, prefHeightMax: null,
    priorities: ['AGE', 'FACE', 'SMOKING'], adminMemo: '테스트 계정',
    comment: '사緣 기능 점검용 테스트 계정이에요. 하트를 보내고 받아 보세요.',
  });
  applicants.push(master);
  applicants.sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  // ── 매칭 내역: 추천 1순위끼리 실제로 맺어 둔다 ─────────────
  const matches = [];
  let matchSeq = 0;
  const plan = [['MET', 'ADMIN'], ['ACCEPTED', 'HEART'], ['PROPOSED', 'ADMIN'], ['DECLINED', 'ADMIN'], ['ACCEPTED', 'ADMIN']];
  const byId = (id) => applicants.find((a) => a.id === id);
  const others = applicants.filter((x) => x.id !== doyun.id && x.id !== master.id);
  for (const a of sample(others.filter((x) => x.status !== 'HOLD'), 24)) {
    if (matches.length >= plan.length) break;
    if (matches.some((m) => m.status !== 'DECLINED' && (m.aId === a.id || m.bId === a.id))) continue;
    const top = scoreCandidates(a, others, matches, codes)[0];
    if (!top) continue;
    const [status, source] = plan[matches.length];
    const createdAt = Math.max(Date.parse(a.createdAt), Date.parse(top.applicant.createdAt)) + int(1, 4) * DAY;
    const at = iso(Math.min(createdAt, now - 3600000));
    matches.push({
      id: ++matchSeq, aId: a.id, bId: top.applicant.id, score: top.score, status, source,
      memo: status === 'DECLINED' ? '한쪽에서 정중히 거절' : '', createdBy: source === 'HEART' ? '(하트 맞교환)' : '정지원', createdAt: at, updatedAt: at,
      ...((status === 'ACCEPTED' || status === 'MET') && { acceptedAt: at }),
    });
    const next = status === 'PROPOSED' ? 'MATCHING' : status === 'DECLINED' ? 'REVIEWING' : 'MATCHED';
    a.status = next;
    byId(top.applicant.id).status = next;
  }

  // ── 하트: 이도윤에게 온 하트 1개(응답 대기) ────────────────
  const hearts = [];
  let heartSeq = 0;
  const admirer = scoreCandidates(doyun, applicants, matches, codes, { recommendableOnly: true })[0]?.applicant;
  if (admirer) hearts.push({ id: ++heartSeq, fromId: admirer.id, toId: doyun.id, status: 'SENT', at: iso(now - 5 * 3600000), answeredAt: null });
  // 만능 계정에게 온 하트 2개 (돌려주기·괜찮아요 둘 다 시험해 볼 수 있게)
  const fans = scoreCandidates(master, applicants.filter((x) => x.id !== admirer?.id), matches, codes, { recommendableOnly: true }).slice(0, 2);
  fans.forEach((f, i) => hearts.push({ id: ++heartSeq, fromId: f.applicant.id, toId: master.id, status: 'SENT', at: iso(now - (2 + i * 3) * 3600000), answeredAt: null }));

  // ── 후기 ────────────────────────────────────────────────
  const reviews = [];
  let reviewSeq = 0;
  const review = (m, reviewerId, targetId, outcome, rating, wantMore, comment, daysAgo) => {
    const at = iso(now - daysAgo * DAY);
    reviews.push({ id: ++reviewSeq, matchId: m.id, reviewerId, targetId, outcome, rating, wantMore, comment, createdAt: at, updatedAt: at });
  };
  const met = matches.find((m) => m.status === 'MET');
  if (met) review(met, met.aId, met.bId, 'MET', 'LIKE', false, '대화가 잘 통했어요. 한 번 더 만나기로 했어요!', 2);

  // 싫어요 제재 예시: 지난 매칭 5건에서 싫어요·노쇼를 받은 신청자 (추천에서 빠져 있음)
  const busy = new Set(matches.flatMap((m) => [m.aId, m.bId]));
  const bad = applicants.find((x) => x.id !== doyun.id && x.id !== master.id && !busy.has(x.id) && x.status !== 'HOLD' && !hearts.some((h) => h.fromId === x.id));
  if (bad) {
    const partners = applicants.filter((x) => x.gender !== bad.gender && x.id !== doyun.id && x.id !== master.id && !busy.has(x.id)).slice(0, 5);
    const kinds = [['NOSHOW', 'DISLIKE', '약속 장소에 나오지 않았고 연락도 없었어요.'], ['MET', 'DISLIKE', '대화 중 무례한 발언이 있었어요.'], ['NOSHOW', 'DISLIKE', ''], ['NO_CONTACT', 'DISLIKE', '연락을 계속 미뤘어요.'], ['MET', 'DISLIKE', '']];
    partners.forEach((pt, i) => {
      const at = iso(now - (40 + i * 6) * DAY);
      const m = { id: ++matchSeq, aId: bad.id, bId: pt.id, score: int(55, 80), status: 'DECLINED', source: 'HEART', memo: '', createdBy: '(하트 맞교환)', createdAt: at, updatedAt: at, acceptedAt: at };
      matches.push(m);
      const [o, r, c] = kinds[i];
      review(m, pt.id, bad.id, o, r, true, c, 38 - i * 6);
    });
  }

  // ── 시스템 개선의 소리 ──────────────────────────────────
  const vocs = [
    { category: 'FEATURE', title: '교대 근무자 필터가 있으면 좋겠어요', content: '교대 근무라 주말·평일 낮에만 만날 수 있어요. 근무 형태가 맞는 분을 우선 추천해 주면 좋겠습니다.', anonymous: true, status: 'REVIEWING', reply: '근무 형태 항목 추가를 검토하고 있어요.', daysAgo: 6 },
    { category: 'MATCHING', title: '하루 3명은 조금 적은 것 같아요', content: '평택캠퍼스는 신청자가 많아서 하루 5명 정도 보면 좋겠습니다. 하트는 1개로 충분해요.', anonymous: false, status: 'RECEIVED', reply: '', daysAgo: 2 },
    { category: 'PRIVACY', title: '후보 카드의 사업부 표시가 부담돼요', content: '같은 사업부 사람끼리는 사업부만으로도 누군지 짐작될 수 있어요. 사업부 공개 여부를 선택할 수 있으면 좋겠어요.', anonymous: true, status: 'RECEIVED', reply: '', daysAgo: 1 },
    { category: 'BUG', title: '모바일에서 하트 버튼이 가려져요', content: '작은 화면에서 하트 보내기 버튼이 화면 아래로 밀려 보이지 않을 때가 있어요.', anonymous: true, status: 'DONE', reply: '10/5 배포에서 고쳤어요. 알려주셔서 고마워요!', daysAgo: 9 },
  ].map((v, i) => {
    const owner = pick(applicants);
    const emp = employees.find((e) => e.empNo === owner.empNo);
    const at = iso(now - v.daysAgo * DAY);
    const { daysAgo, ...rest } = v;
    return { id: 4 - i, ...rest, ownerEmpNo: emp.empNo, author: v.anonymous ? null : `${emp.name} · ${emp.team}`, createdAt: at, updatedAt: at };
  });

  // ── 관리자 열람 기록 ─────────────────────────────────────
  const manager = employees[0];
  const ip = () => `10.${int(20, 90)}.${int(1, 250)}.${int(2, 250)}`;
  const target = (a) => `#${a.id} ${initials(a.name)}`;
  const managerIp = ip();
  const logs = [];
  const log = (daysAgo, action, tgt = '', detail = '', actor = manager, addr = managerIp) =>
    logs.push({ at: iso(now - daysAgo * DAY), actorEmpNo: actor.empNo, actorName: actor.name, action, target: tgt, detail, ip: addr });

  const someone = employees.find((e) => e.adId !== manager.adId && !e.retired && e.adId !== TEST_ACCOUNTS.NEW);
  log(9.2, 'ADMIN_ENTER');
  log(9.19, 'VIEW_APPLICANT', target(applicants[2]));
  log(9.15, 'STATUS_CHANGE', '3명', '접수 → 검토 중');
  log(9.1, 'ADMIN_EXIT');
  log(6.4, 'ADMIN_ENTER_FAIL', '', '1회째 실패', someone, ip());
  log(5.3, 'ADMIN_ENTER');
  log(5.28, 'CODE_CHANGE', '기준정보 · 얼굴상', '항목 추가: 늑대상');
  for (const m of matches.filter((x) => x.source === 'ADMIN').slice(0, 3)) log(5.25, 'MATCH_CREATE', `#${m.aId} ↔ #${m.bId}`, `추천 점수 ${m.score}`);
  log(5.2, 'REVEAL_PII', '신청자 목록', '이름 전체 표시');
  log(5.18, 'EXPORT', '신청자 목록', `${applicants.length}명 · 이름 가림`);
  log(5.1, 'ADMIN_EXIT');
  log(1.3, 'ADMIN_ENTER');
  log(1.28, 'UPDATE_APPLICANT', target(applicants[8]), '변경 항목: 상태, 관리 메모');
  log(1.2, 'ADMIN_EXIT');

  // ── 쪽지: 만능 계정 환영 쪽지 + 진행 중인 매칭 한 쌍의 쪽지 예시 ──
  const messages = [
    { id: 1, thread: `A${master.id}`, fromId: null, fromAdmin: true, adminName: '정지원', toId: master.id, body: '사緣 테스트 계정에 오신 걸 환영해요! 궁금한 점은 이 쪽지함으로 보내주세요.', at: iso(now - 3600000), readAt: null, box: {} },
  ];
  const talking = matches.find((m) => m.status === 'ACCEPTED');
  if (talking) {
    const lines = [
      [talking.aId, '안녕하세요! 매칭돼서 반가워요. 주말에 보통 뭐 하세요?'],
      [talking.bId, '반가워요 :) 주말엔 주로 러닝하고 카페 다녀요. 동탄 쪽 자주 가세요?'],
      [talking.aId, '저도 동탄 살아요! 다음 주에 커피 한잔 어떠세요?'],
    ];
    lines.forEach(([from, body], i) => messages.push({
      id: messages.length + 1, thread: `M${talking.id}`, fromId: from, toId: from === talking.aId ? talking.bId : talking.aId,
      body, at: iso(now - (20 - i * 3) * 3600000), readAt: iso(now - (19 - i * 3) * 3600000), box: {},
    }));
  }
  // ── 블랙리스트 예시: 신청하지 않은 임직원 1명 ──
  const blocked = employees.find((e) => !e.retired && !testIds.includes(e.adId) && !applicants.some((a) => a.empNo === e.empNo) && e.adId !== TEST_ACCOUNTS.NEW);
  const blacklist = blocked ? [{ empNo: blocked.empNo, reason: '이전 운영 기간 중 다수 신고 (예시)', at: iso(now - 10 * DAY), by: '정지원' }] : [];
  const auditLogs = logs.reverse().map((l, i) => ({ id: logs.length - i, ...l }));

  return {
    version: 4,
    settings: { ...DEFAULT_SETTINGS },
    admins: employees.filter((e) => ADMIN_ACCOUNTS.includes(e.adId)).map((e) => e.empNo), // 관리자 계정 (accounts.js)
    codes,
    employees,
    applicants,
    matches,
    hearts,
    reviews,
    vocs,
    messages,
    blacklist, // [{ empNo, reason, at, by }] 신청 자체를 막는 사번
    penalties: {}, // { [empNo]: { count, at } } 탈퇴 시 남기는 싫어요 횟수 (6개월 보관 후 파기)
    daily: {}, // { [applicantId]: { date, ids, cursor, heartTo } }
    seen: {}, // { [applicantId]: { [candidateId]: 'YYYY-MM-DD' } }
    auditLogs,
    seq: { applicant: applicantSeq, match: matchSeq, audit: auditLogs.length, heart: heartSeq, review: reviewSeq, voc: vocs.length, message: messages.length },
  };
}
