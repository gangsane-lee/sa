/**
 * 신청서 화면 모델 ↔ API 모델 변환
 * - 화면: 선호 나이를 RangeSlider용 prefAge: [min, max], 태어난 시간 모름을 birthTimeUnknown 으로 다룬다
 * - API/DB: prefAgeMin/prefAgeMax, birthTime(null = 모름)
 */
import { PREF_ITEMS } from '../constants/codes.js';

const MULTI_PREF_KEYS = PREF_ITEMS.filter((p) => p.kind === 'multi').map((p) => p.key);

/** 새 신청서. 사내 로그인으로 받은 인사 정보(이름·성별·사업부·팀)로 미리 채운다 */
export function emptyForm(user = {}) {
  return {
    name: user.name ?? '',
    nickname: '',
    gender: user.gender ?? null,
    serious: null,
    birthDate: null,
    birthTime: null,
    birthTimeUnknown: true,
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
    priorities: [],

    agreePrivacy: false,
    agreeShare: false,
  };
}

const FORM_KEYS = Object.keys(emptyForm());

export function toFormModel(app) {
  const form = emptyForm();
  for (const k of FORM_KEYS) if (k in app) form[k] = Array.isArray(app[k]) ? [...app[k]] : app[k];
  form.prefAge = [app.prefAgeMin, app.prefAgeMax];
  form.birthTimeUnknown = !app.birthTime;
  return form;
}

export function fromFormModel(form) {
  const { prefAge, birthTimeUnknown, ...rest } = form;
  const out = {
    ...rest,
    prefAgeMin: prefAge[0],
    prefAgeMax: prefAge[1],
    birthTime: birthTimeUnknown ? null : rest.birthTime || null,
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
  name: '이름', nickname: '닉네임', serious: '진지한 만남 여부', gender: '성별', birthDate: '생년월일', birthTime: '태어난 시간', heightBand: '키', hobbies: '취미',
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

export const SECTIONS = [
  {
    key: 'basic',
    title: '나는 이런 사람',
    fields: ['nickname', 'gender', 'serious', 'birthDate', 'division', 'team', 'heightBand', 'body', 'face', 'looks', 'mbti', 'hobbies', 'drinking', 'smoking'],
  },
  { key: 'pref', title: '이런 분이면 좋겠어요', fields: ['prefAge', 'priorities'] },
  { key: 'consent', title: '동의', fields: ['agreePrivacy', 'agreeShare'] },
];

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
  { key: 'birthTime', label: '태어난 시간', nudge: '인연 사주 궁합이 더 정확해져요.', filled: (f) => !f.birthTimeUnknown && Boolean(f.birthTime) },
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
