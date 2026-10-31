/**
 * 신청서 화면 모델 ↔ API 모델 변환
 * - 화면: 선호 나이를 RangeSlider용 prefAge: [min, max] 로 다룬다
 * - API/DB: prefAgeMin/prefAgeMax
 * - 생년월일은 개인정보 보호로 저장하지 않고 출생연도(birthYear, 숫자)만 받는다
 */
import { PREF_ITEMS } from '../constants/codes.js';

const MULTI_PREF_KEYS = PREF_ITEMS.filter((p) => p.kind === 'multi').map((p) => p.key);

/**
 * 새 신청서. 사내 로그인으로 받은 인사 정보(이름·사업부·팀)로 미리 채운다 — 화면은 user_name, 서버는 name
 * 성별은 미리 채우지 않는다 — 신청자가 직접 고른다 (필수, 인사정보에 성별이 없는 경우가 있다)
 */
export function emptyForm(user = {}) {
  return {
    name: user.user_name ?? user.name ?? '',
    nickname: '',
    gender: null,
    serious: null,
    birthYear: null,
    heightBand: null,
    hobbies: [],
    mbti: null,
    religion: null,
    agreeSensitive: false,
    residence: '',
    division: user.division ?? null,
    team: user.team ?? '',
    campus: null,
    building: null,
    comment: '',
    face: null,
    body: null,
    looks: null,
    drinking: null,
    smoking: null,

    prefAge: [25, 38],
    prefHeightMin: null,
    prefHeightMax: null,
    avoid: ['TEAM'],
    ...Object.fromEntries(MULTI_PREF_KEYS.map((k) => [k, []])),
    priorities: ['AGE'], // 처음에는 '나이'를 1순위로 — 선호를 더 고르면 바꿀 수 있다

    agreePrivacy: false,
    agreeShare: false,
  };
}

const FORM_KEYS = Object.keys(emptyForm());

export function toFormModel(app) {
  const form = emptyForm();
  for (const k of FORM_KEYS) if (k in app) form[k] = Array.isArray(app[k]) ? [...app[k]] : app[k];
  form.prefAge = [app.prefAgeMin, app.prefAgeMax];
  return form;
}

export function fromFormModel(form) {
  const { prefAge, ...rest } = form;
  const out = {
    ...rest,
    prefAgeMin: prefAge[0],
    prefAgeMax: prefAge[1],
    birthYear: rest.birthYear == null || rest.birthYear === '' ? null : Number(rest.birthYear),
    name: rest.name.trim(),
    team: rest.team.trim(),
    nickname: (rest.nickname ?? '').trim(),
    building: (rest.building ?? '').trim() || null,
    residence: (rest.residence ?? '').trim(),
    comment: (rest.comment ?? '').trim(),
  };
  // 키 선호는 둘 다 고르거나 둘 다 비운다
  if (!out.prefHeightMin || !out.prefHeightMax) {
    out.prefHeightMin = null;
    out.prefHeightMax = null;
  }
  // 민감정보 동의를 철회하면 종교 관련 값도 함께 지운다
  if (!out.agreeSensitive) {
    out.religion = null;
    out.prefReligions = [];
    out.priorities = out.priorities.filter((p) => p !== 'RELIGION');
  }
  return out;
}

/** 신청서 항목 이름 — 관리자 수정 기록에 '무엇을 바꿨는지'를 남길 때 쓴다 (값은 남기지 않는다) */
export const FIELD_LABELS = {
  name: '이름', nickname: '닉네임', serious: '진지한 만남 여부', gender: '성별', birthYear: '출생연도', heightBand: '키', hobbies: '취미',
  mbti: 'MBTI', religion: '종교', agreeSensitive: '민감정보 동의', residence: '사는 곳', division: '사업부', team: '팀',
  campus: '캠퍼스', building: '건물 위치', comment: '코멘트', face: '얼굴상', body: '체형', looks: '외모',
  drinking: '음주', smoking: '흡연',
  prefAgeMin: '선호 나이', prefAgeMax: '선호 나이', prefHeightMin: '선호 키', prefHeightMax: '선호 키',
  avoid: '피하고 싶은 범위', prefDivisions: '선호 사업부', prefAgeGap: '선호 연상·연하', prefFaces: '선호 얼굴상', prefHobbies: '선호 취미',
  prefDrinking: '선호 음주', prefMbtis: '선호 MBTI', prefReligions: '선호 종교', prefSmoking: '선호 흡연',
  prefBodies: '선호 체형', priorities: '선호 우선순위', status: '상태', adminMemo: '관리 메모',
};

/** 진행률 계산용: 섹션별 필수 항목 */
const filled = (v) => (Array.isArray(v) ? v.length > 0 : v !== null && v !== undefined && String(v).trim() !== '');

/**
 * 신청서 페이지 — 처음 신청할 때는 설문처럼 한 페이지씩(정규 신청·인연 사주 신청 같은 양식),
 * 신청 후 수정할 때는 한 화면에 모두 보여준다. fields 는 그 페이지의 필수 항목(진행률 계산용),
 * optional 은 '선택 항목 더 보기'를 눌러야 보이는 항목이다.
 */
export const SECTIONS = [
  { key: 'me', title: '나는 이런 사람', short: '기본 정보', fields: ['gender', 'birthYear', 'nickname', 'serious', 'division', 'team'], optional: ['campus', 'building'] },
  { key: 'look', title: '나의 모습', short: '모습', fields: ['heightBand', 'body', 'face', 'looks'], optional: [] },
  { key: 'life', title: '나의 일상', short: '일상', fields: ['mbti', 'hobbies', 'drinking', 'smoking'], optional: ['residence', 'religion', 'comment'] },
  {
    key: 'pref',
    title: '이런 분이면 좋겠어요',
    short: '선호 · 동의',
    fields: ['prefAge', 'priorities', 'agreePrivacy', 'agreeShare'],
    optional: ['prefAgeGap', 'prefFaces', 'prefHeightMin', 'avoid', 'prefDivisions', 'prefHobbies', 'prefDrinking', 'prefMbtis', 'prefSmoking', 'prefBodies', 'prefReligions'],
  },
];
/** 항목 → 페이지 번호 (선택 항목을 채우러 갈 때) */
export const pageOfField = (key) => Math.max(0, SECTIONS.findIndex((s) => s.fields.includes(key) || s.optional.includes(key)));

export function sectionProgress(form) {
  return SECTIONS.map((s) => {
    const done = s.fields.filter((f) => {
      const v = form[f];
      if (typeof v === 'boolean') return v;
      return filled(v);
    }).length;
    return { ...s, done, total: s.fields.length };
  });
}

/**
 * 선택 항목 — 채울수록 추천이 정확해진다. 신청서에서 '채우면 좋아요' 안내와 추천 정확도에 쓴다.
 * 민감정보(종교)와 사는 곳은 개인정보 최소 수집 원칙상 유도하지 않는다.
 */
export const OPTIONAL_BOOSTERS = [
  { key: 'campus', label: '캠퍼스', nudge: '캠퍼스를 알려주셔서 가까운 분을 먼저 찾아드릴게요.' },
  { key: 'building', label: '건물 위치', nudge: '같은 건물 피하기가 정확해졌어요.' },
  { key: 'comment', label: '코멘트', nudge: '코멘트가 있는 카드는 하트를 받을 가능성이 높아요.' },
  { key: 'prefAgeGap', label: '연상·연하', nudge: '연상·연하 취향까지 알려주셔서 나이 궁합이 맞는 분을 찾기 쉬워졌어요.' },
  { key: 'prefFaces', label: '선호 얼굴상', nudge: '좋아하는 얼굴상을 알려주셔서 첫인상이 맞는 분을 찾기 쉬워졌어요.' },
  { key: 'prefHeightMin', label: '선호 키', nudge: '키 선호가 반영돼 추천이 더 정교해졌어요.', filled: (f) => Boolean(f.prefHeightMin && f.prefHeightMax) },
  { key: 'prefHobbies', label: '선호 취미', nudge: '취미가 통하는 분이 더 위로 올라와요.' },
  { key: 'prefMbtis', label: '선호 MBTI', nudge: 'MBTI 선호가 반영됐어요.' },
  { key: 'prefDrinking', label: '선호 음주', nudge: '술자리 취향이 맞는 분을 찾기 쉬워졌어요.' },
  { key: 'prefSmoking', label: '선호 흡연', nudge: '흡연 선호가 반영됐어요.' },
  { key: 'prefBodies', label: '선호 체형', nudge: '체형 선호가 반영됐어요.' },
  { key: 'prefDivisions', label: '선호 사업부', nudge: '사업부 선호가 반영됐어요.' },
];
const boosterFilled = (b, f) => (b.filled ? b.filled(f) : filled(f[b.key]));

/** 추천 정확도(%) — 필수만 채우면 50%, 선택 항목을 채울수록 100%까지 */
export function matchReadiness(form) {
  const done = OPTIONAL_BOOSTERS.filter((b) => boosterFilled(b, form));
  return {
    pct: Math.round(50 + (done.length / OPTIONAL_BOOSTERS.length) * 50),
    missing: OPTIONAL_BOOSTERS.filter((b) => !boosterFilled(b, form)),
    filledKeys: new Set(done.map((b) => b.key)),
  };
}
