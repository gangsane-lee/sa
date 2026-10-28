/**
 * 인연 사주 — 재미용 사주 풀이 (마케팅 기능)
 * - 사주 4주(연·월·일·시)는 lunar-javascript 1.7.7(MIT)로 계산한다. 절기(입춘·경칩…) 기준이라 양력 1~2월생도 정확하다
 * - 브라우저 안에서만 계산하고 서버로 보내지 않는다
 * - 시간 보정: 한국 표준시(동경 135°)와 서울 실제 경도(약 127°)의 차이를 30분으로 보고 뺀다 (국내 만세력 관례)
 * - 자시(23:00~) 일주: 다음 날로 본다 (lunar-javascript sect 1)
 * - 풀이 문구는 사주 일반론을 바탕으로 사緣이 쓴 오락용 문장이다
 */
import { Solar } from 'lunar-javascript';

const GAN = {
  甲: { ko: '갑', el: 'WOOD', yang: true },
  乙: { ko: '을', el: 'WOOD', yang: false },
  丙: { ko: '병', el: 'FIRE', yang: true },
  丁: { ko: '정', el: 'FIRE', yang: false },
  戊: { ko: '무', el: 'EARTH', yang: true },
  己: { ko: '기', el: 'EARTH', yang: false },
  庚: { ko: '경', el: 'METAL', yang: true },
  辛: { ko: '신', el: 'METAL', yang: false },
  壬: { ko: '임', el: 'WATER', yang: true },
  癸: { ko: '계', el: 'WATER', yang: false },
};
const ZHI = {
  子: { ko: '자', el: 'WATER', animal: '쥐' },
  丑: { ko: '축', el: 'EARTH', animal: '소' },
  寅: { ko: '인', el: 'WOOD', animal: '호랑이' },
  卯: { ko: '묘', el: 'WOOD', animal: '토끼' },
  辰: { ko: '진', el: 'EARTH', animal: '용' },
  巳: { ko: '사', el: 'FIRE', animal: '뱀' },
  午: { ko: '오', el: 'FIRE', animal: '말' },
  未: { ko: '미', el: 'EARTH', animal: '양' },
  申: { ko: '신', el: 'METAL', animal: '원숭이' },
  酉: { ko: '유', el: 'METAL', animal: '닭' },
  戌: { ko: '술', el: 'EARTH', animal: '개' },
  亥: { ko: '해', el: 'WATER', animal: '돼지' },
};

export const ELEMENTS = {
  WOOD: { ko: '목', hanja: '木', name: '나무', color: '#2E8B57', yearColor: '푸른' },
  FIRE: { ko: '화', hanja: '火', name: '불', color: '#C8243F', yearColor: '붉은' },
  EARTH: { ko: '토', hanja: '土', name: '흙', color: '#B07D12', yearColor: '황금' },
  METAL: { ko: '금', hanja: '金', name: '쇠', color: '#7D8299', yearColor: '하얀' },
  WATER: { ko: '수', hanja: '水', name: '물', color: '#2C4A8A', yearColor: '검은' },
};
const ORDER = ['WOOD', 'FIRE', 'EARTH', 'METAL', 'WATER'];
/** a가 낳는(생하는) 오행 */
const generates = (a) => ORDER[(ORDER.indexOf(a) + 1) % 5];
/** a를 낳는 오행 */
const generatedBy = (a) => ORDER[(ORDER.indexOf(a) + 4) % 5];
/** a가 이기는(극하는) 오행 */
const controls = (a) => ORDER[(ORDER.indexOf(a) + 2) % 5];

/** 일간(나를 나타내는 글자)별 풀이 */
const DAY_MASTER = {
  甲: { image: '곧게 뻗은 큰 나무', nature: '한번 정한 길은 끝까지 가는 우직한 리더형이에요. 믿음직하지만 고집도 꽤 있어요.', love: '좋아하면 돌려 말하지 않아요. 상대를 지켜주고 이끌어주고 싶어 하는 연애를 해요.' },
  乙: { image: '바람에 흔들려도 꺾이지 않는 꽃과 덩굴', nature: '부드럽고 유연하지만 속은 단단해요. 사람 사이 분위기를 잘 읽어요.', love: '천천히 스며드는 연애가 잘 맞아요. 세심한 배려로 상대를 편하게 해줘요.' },
  丙: { image: '한낮의 태양', nature: '밝고 솔직해서 어디서든 눈에 띄어요. 숨기는 게 서툰 사람이에요.', love: '표현이 크고 따뜻해요. 함께 있으면 상대까지 환해지는 연애를 해요.' },
  丁: { image: '어둠을 밝히는 촛불', nature: '섬세하고 따뜻한 집중력이 있어요. 가까운 사람에게 깊이 마음을 써요.', love: '조용하지만 오래 타는 불처럼, 한 사람에게 진심을 다하는 연애를 해요.' },
  戊: { image: '넓고 듬직한 산', nature: '흔들림 없이 묵직해서 주변이 기대고 싶어 해요. 말보다 행동이 먼저예요.', love: '쉽게 시작하진 않지만, 마음을 정하면 든든한 버팀목이 되어줘요.' },
  己: { image: '곡식을 기르는 기름진 밭', nature: '포용력이 크고 실속 있어요. 사람을 챙기고 키워내는 데 재능이 있어요.', love: '상대의 일상을 살뜰히 챙기는 다정한 연애를 해요. 안정감이 최고의 매력이에요.' },
  庚: { image: '단단한 원석과 바위', nature: '의리 있고 결단이 빨라요. 옳다고 생각하면 바로 움직여요.', love: '밀당보다 직진이에요. 한번 내 사람이면 끝까지 책임지는 연애를 해요.' },
  辛: { image: '세공된 보석', nature: '감각이 예리하고 깔끔한 걸 좋아해요. 기준이 분명한 완벽주의 성향이 있어요.', love: '취향이 맞는 사람에게 끌려요. 작은 디테일로 마음을 표현하는 로맨티스트예요.' },
  壬: { image: '넓게 흐르는 큰 강과 바다', nature: '생각의 폭이 넓고 자유로워요. 어디든 잘 적응하는 지혜로운 사람이에요.', love: '대화가 통하는 사람에게 깊이 빠져요. 함께 새로운 곳을 탐험하는 연애가 잘 맞아요.' },
  癸: { image: '대지를 적시는 봄비', nature: '조용하지만 직관이 뛰어나요. 남들이 못 보는 마음을 먼저 알아채요.', love: '상대의 감정을 섬세하게 읽고 촉촉하게 감싸주는 연애를 해요.' },
};

/** 부족하거나 넘치는 오행에 따라 끌리는 사람 */
const ATTRACT = {
  WOOD: '새로운 일을 같이 벌이고 키워가는 성장형 사람',
  FIRE: '표현이 풍부하고 웃음이 많은 밝은 사람',
  EARTH: '약속을 잘 지키고 한결같은 듬직한 사람',
  METAL: '맺고 끊음이 분명하고 깔끔한 사람',
  WATER: '이야기를 잘 들어주는 차분하고 지혜로운 사람',
};

/** 오늘 일진의 오행과 나(일간)의 관계 → 오늘의 연애 기류 */
const TODAY_FLOW = {
  SAME: { title: '친구처럼 편안한 인연의 날', text: '비슷한 결의 사람과 대화가 술술 풀려요. 공통 관심사로 말을 걸어보세요.' },
  OUTPUT: { title: '매력이 빛나는 날', text: '오늘은 내 표현이 잘 전달돼요. 마음에 드는 사람이 있다면 먼저 한마디 건네도 좋아요.' },
  WEALTH: { title: '적극적으로 다가가면 좋은 날', text: '기다리기보다 먼저 움직일 때 결과가 좋아요. 하트를 아끼지 마세요.' },
  OFFICER: { title: '진지한 인연이 다가오는 날', text: '가볍기보다 믿음직한 사람이 눈에 들어와요. 상대의 코멘트를 꼼꼼히 읽어보세요.' },
  RESOURCE: { title: '마음이 채워지는 날', text: '누군가의 작은 배려가 크게 느껴져요. 받은 하트가 있다면 천천히 들여다보세요.' },
};

const PLACES = ['구내식당 창가 자리', '통근버스 뒷자리', '사내 카페 테이크아웃 줄', '피트니스 센터', '사내 도서관', '캠퍼스 산책로', '엘리베이터 앞', '회의실 복도'];
const TIMES = ['출근길 8시대', '점심시간', '오후 3시 커피 타임', '퇴근 무렵', '저녁 산책 시간'];
const LINES = [
  '스치는 인사 한마디가 오래 기억될 거예요.',
  '익숙한 얼굴에게서 새로운 면을 발견할 수 있어요.',
  '평소보다 조금 더 웃어보세요. 분위기가 달라져요.',
  '망설였던 일을 해보기 좋은 날이에요.',
  '오늘 고른 선택이 생각보다 큰 인연으로 이어질 수 있어요.',
  '서두르지 않아도 괜찮아요. 천천히 다가오는 인연이 있어요.',
];

/** 문자열을 고정된 0~1 난수로 (같은 사람·같은 날엔 같은 결과) */
function seeded(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return () => {
    h ^= h << 13;
    h ^= h >>> 17;
    h ^= h << 5;
    return ((h >>> 0) % 10000) / 10000;
  };
}

const pillarOf = (gz, label) => {
  const g = GAN[gz[0]];
  const z = ZHI[gz[1]];
  return { label, hanja: gz, ko: g.ko + z.ko, gan: { char: gz[0], ...g }, zhi: { char: gz[1], ...z } };
};

/**
 * @param {{ birthDate: string, birthTime?: string|null }} input  birthDate 'YYYY-MM-DD', birthTime 'HH:mm' 또는 null(모름)
 * @param {Date} today 오늘의 연애운 기준일
 */
export function readSaju({ birthDate, birthTime = null }, today = new Date()) {
  const [y, m, d] = birthDate.split('-').map(Number);
  let solar;
  if (birthTime) {
    const [hh, mm] = birthTime.split(':').map(Number);
    const t = new Date(Date.UTC(y, m - 1, d, hh, mm) - 30 * 60000); // 경도 보정 -30분
    solar = Solar.fromYmdHms(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate(), t.getUTCHours(), t.getUTCMinutes(), 0);
  } else {
    solar = Solar.fromYmdHms(y, m, d, 12, 0, 0);
  }
  const ec = solar.getLunar().getEightChar();
  ec.setSect(1);

  const pillars = [
    birthTime ? pillarOf(ec.getTime(), '시주') : null,
    pillarOf(ec.getDay(), '일주'),
    pillarOf(ec.getMonth(), '월주'),
    pillarOf(ec.getYear(), '연주'),
  ];
  const known = pillars.filter(Boolean);

  // 오행 분포 (천간·지지 글자 수)
  const counts = Object.fromEntries(ORDER.map((e) => [e, 0]));
  for (const p of known) {
    counts[p.gan.el]++;
    counts[p.zhi.el]++;
  }
  const total = known.length * 2;
  const sorted = [...ORDER].sort((a, b) => counts[b] - counts[a]);
  const strongest = sorted[0];
  const missing = ORDER.filter((e) => counts[e] === 0);
  const weakest = missing[0] ?? sorted.at(-1);

  const dayGan = ec.getDay()[0];
  const me = GAN[dayGan];
  const year = pillars[3];

  // 오늘의 연애운
  const todayEc = Solar.fromYmdHms(today.getFullYear(), today.getMonth() + 1, today.getDate(), 12, 0, 0).getLunar().getEightChar();
  const todayEl = GAN[todayEc.getDay()[0]].el;
  const relation =
    todayEl === me.el ? 'SAME'
      : todayEl === generates(me.el) ? 'OUTPUT'
        : todayEl === controls(me.el) ? 'WEALTH'
          : controls(todayEl) === me.el ? 'OFFICER'
            : 'RESOURCE';
  const ymd = `${today.getFullYear()}-${today.getMonth() + 1}-${today.getDate()}`;
  const rnd = seeded(`${birthDate}|${birthTime ?? ''}|${ymd}`);
  const bonus = { WEALTH: 10, OUTPUT: 8, OFFICER: 6, SAME: 4, RESOURCE: 4 }[relation];
  const score = Math.min(99, 58 + bonus + Math.floor(rnd() * 31));
  const pick = (arr) => arr[Math.floor(rnd() * arr.length)];

  return {
    pillars,
    timeKnown: Boolean(birthTime),
    zodiac: `${ELEMENTS[year.gan.el].yearColor} ${year.zhi.animal}띠`,
    dayMaster: { char: dayGan, ko: me.ko, element: me.el, yang: me.yang, ...DAY_MASTER[dayGan] },
    counts,
    total,
    strongest,
    missing,
    weakest,
    /** 끌리는 사람: 부족한 기운을 채워주는 사람 */
    attract: { element: weakest, text: ATTRACT[weakest] },
    /** 편안한 사람: 나를 생해주는(돕는) 오행이 강한 사람 */
    comfort: { element: generatedBy(me.el), text: ATTRACT[generatedBy(me.el)] },
    today: {
      date: ymd,
      element: todayEl,
      score,
      ...TODAY_FLOW[relation],
      line: pick(LINES),
      place: pick(PLACES),
      time: pick(TIMES),
      color: ELEMENTS[weakest],
    },
  };
}

// ── 궁합 ────────────────────────────────────────────────
/** 받침 유무로 조사 고르기 (과/와, 이/가 …) */
export const josa = (word, withBatchim, without) => {
  const c = String(word).charCodeAt(String(word).length - 1) - 0xac00;
  return c >= 0 && c < 11172 && c % 28 !== 0 ? withBatchim : without;
};
const YUKHAP = ['子丑', '寅亥', '卯戌', '辰酉', '巳申', '午未'];
const SAMHAP = ['申子辰', '亥卯未', '寅午戌', '巳酉丑'];
const CHUNG = ['子午', '丑未', '寅申', '卯酉', '辰戌', '巳亥'];
const pairIn = (list, x, y) => list.some((p) => (p.includes(x) && p.includes(y) && x !== y));

const DAY_RELATION = {
  SAME: { score: 74, title: '오래된 친구 같은 궁합', text: '같은 기운을 타고나 말하지 않아도 통하는 사이예요. 편안함 속에서 천천히 깊어져요.' },
  NURTURE: { score: 88, title: '서로를 북돋는 궁합', text: '한 사람의 기운이 다른 사람을 자라게 하는 상생의 조합이에요. 함께 있을수록 서로 좋은 사람이 돼요.' },
  SPARK: { score: 68, title: '끌림이 강한 궁합', text: '서로 다른 기운이 부딪히며 강한 끌림을 만들어요. 다름을 존중하면 누구보다 뜨거운 사이가 돼요.' },
};

/**
 * 사주 기본 정보 (일간·띠·오행 분포) — 궁합 계산용, 원문 생년월일은 결과에 넣지 않는다
 *  - birthDate: 인연 사주 화면에서 입력한 생년월일(저장하지 않음) → 4주로 계산
 *  - birthYear: 신청서의 출생연도(월일은 저장하지 않음) → 연주(띠)만으로 계산
 */
function basics({ birthDate = null, birthTime = null, birthYear = null }) {
  if (birthDate) {
    const r = readSaju({ birthDate, birthTime });
    return { dayEl: r.dayMaster.element, dayChar: r.dayMaster.char, yearZhi: r.pillars[3].zhi.char, counts: r.counts, missing: r.missing, image: r.dayMaster.image };
  }
  const y = Number(String(birthYear ?? '').slice(0, 4));
  if (!Number.isInteger(y) || y < 1900) throw new Error('출생연도 없음');
  const ec = Solar.fromYmdHms(y, 7, 1, 12, 0, 0).getLunar().getEightChar(); // 한해 가운데 날로 그해 연주
  ec.setSect(1);
  const p = pillarOf(ec.getYear(), '연주');
  const counts = Object.fromEntries(ORDER.map((e) => [e, 0]));
  counts[p.gan.el]++;
  counts[p.zhi.el]++;
  return { dayEl: p.gan.el, dayChar: p.gan.char, yearZhi: p.zhi.char, counts, missing: ORDER.filter((e) => counts[e] === 0), image: DAY_MASTER[p.gan.char]?.image };
}

/**
 * 두 사람의 사주 궁합 (오락용). 서버가 계산해 결과만 내려주고, 상대 생년월일은 보내지 않는다.
 * @returns {{ score, title, text, points: string[], me: {element}, them: {element} }}
 */
export function compatibility(a, b) {
  const A = basics(a);
  const B = basics(b);
  const rel = A.dayEl === B.dayEl ? 'SAME' : generates(A.dayEl) === B.dayEl || generates(B.dayEl) === A.dayEl ? 'NURTURE' : 'SPARK';
  let score = DAY_RELATION[rel].score;
  const points = [];
  const el = (e) => `${ELEMENTS[e].name}(${ELEMENTS[e].hanja})`;

  if (rel === 'NURTURE') {
    const giver = generates(A.dayEl) === B.dayEl ? '내' : '상대의';
    points.push(`${giver} ${el(giver === '내' ? A.dayEl : B.dayEl)} 기운이 ${giver === '내' ? '상대' : '나'}를 살려줘요`);
  } else if (rel === 'SAME') points.push(`둘 다 ${el(A.dayEl)}의 사람, 생각의 속도가 닮았어요`);
  else points.push(`${el(A.dayEl)}${josa(ELEMENTS[A.dayEl].name, '과', '와')} ${el(B.dayEl)}, 서로에게 없는 매력에 끌려요`);

  if (pairIn(YUKHAP, A.yearZhi, B.yearZhi)) {
    score += 9;
    points.push('띠끼리 육합 — 손을 맞잡듯 잘 어울려요');
  } else if (SAMHAP.some((g) => g.includes(A.yearZhi) && g.includes(B.yearZhi) && A.yearZhi !== B.yearZhi)) {
    score += 7;
    points.push('띠끼리 삼합 — 같은 방향을 바라보는 사이예요');
  } else if (pairIn(CHUNG, A.yearZhi, B.yearZhi)) {
    score -= 6;
    points.push('띠끼리는 부딪히는 편이라 대화로 맞춰가면 좋아요');
  }

  const fill = A.missing.find((e) => B.counts[e] >= 2);
  if (fill) {
    score += 6;
    points.push(`내게 없는 ${el(fill)} 기운을 상대가 넉넉히 가졌어요`);
  }
  const give = B.missing.find((e) => A.counts[e] >= 2);
  if (give) {
    score += 4;
    points.push(`상대에게 없는 ${el(give)} 기운을 내가 채워줄 수 있어요`);
  }

  // 같은 두 사람이면 늘 같은 결과가 나오도록 고정 시드로 미세 조정
  const rnd = seeded([a, b].map((x) => String(x.birthDate ?? x.birthYear)).sort().join('|'));
  score = Math.max(55, Math.min(98, score + Math.floor(rnd() * 7) - 3));
  return { score, title: DAY_RELATION[rel].title, text: DAY_RELATION[rel].text, points: points.slice(0, 3), me: { element: A.dayEl }, them: { element: B.dayEl, image: B.image } };
}
