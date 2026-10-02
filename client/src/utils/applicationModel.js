/**
 * 신청서 화면 모델 ↔ API 모델 변환
 * - 화면: 선호 나이를 RangeSlider용 배열 prefAge: [min, max] 로 다룬다
 * - API/DB: prefAgeMin, prefAgeMax 로 나눠 저장한다
 */

/** 새 신청서. 로그인 때 받은 인사 정보(이름·사업부·소속·CL·근무지·메일)로 미리 채운다 */
export function emptyForm(user = {}) {
  return {
    name: user.name ?? '',
    gender: user.gender ?? null,
    birthYear: null,
    division: user.division ?? null,
    dept: user.dept ?? '',
    careerLevel: user.careerLevel ?? null,
    workSite: user.workSite ?? null,
    workPattern: null,
    phone: '',
    email: user.email ?? '',

    height: null,
    bodyType: null,
    residence: '',
    education: null,
    smoking: null,
    drinking: null,
    mbti: null,
    religion: null,
    agreeSensitive: false,
    hobbies: [],
    personality: [],
    intro: '',

    prefAge: [27, 36],
    prefKeywords: [],
    prefSmoking: 'ANY',
    meetingStyle: null,
    avoidScope: 'TEAM',
    messageToManager: '',

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
    name: rest.name.trim(),
    dept: rest.dept.trim(),
    email: rest.email.trim(),
    residence: rest.residence.trim(),
    intro: rest.intro.trim(),
    messageToManager: (rest.messageToManager ?? '').trim(),
  };
  // 민감정보 동의를 철회하면 종교 값도 함께 지운다
  if (!out.agreeSensitive) out.religion = null;
  return out;
}

/** 신청서 항목 이름 — 관리자 수정 기록에 '무엇을 바꿨는지'를 남길 때 쓴다 (값은 남기지 않는다) */
export const FIELD_LABELS = {
  name: '이름', gender: '성별', birthYear: '출생연도', division: '사업부', dept: '소속',
  careerLevel: '직급', workSite: '근무지', workPattern: '근무 형태', phone: '휴대전화', email: '이메일',
  height: '키', bodyType: '체형', residence: '거주 지역', education: '학력', smoking: '흡연',
  drinking: '음주', mbti: 'MBTI', religion: '종교', agreeSensitive: '민감정보 동의', hobbies: '취미',
  personality: '성격 키워드', intro: '자기소개', prefAgeMin: '선호 나이', prefAgeMax: '선호 나이',
  prefKeywords: '이상형 키워드', prefSmoking: '상대의 흡연', meetingStyle: '첫 만남',
  avoidScope: '매칭 제외 범위', messageToManager: '담당자에게 한마디', status: '상태', adminMemo: '관리 메모',
};

/** 진행률 계산용: 섹션별 필수 항목 */
const filled = (v) => (Array.isArray(v) ? v.length > 0 : v !== null && v !== undefined && String(v).trim() !== '');

export const SECTIONS = [
  {
    key: 'basic',
    title: '기본 정보',
    fields: ['name', 'gender', 'birthYear', 'division', 'dept', 'careerLevel', 'workSite', 'workPattern', 'phone', 'email'],
  },
  {
    key: 'profile',
    title: '나를 소개해요',
    fields: ['height', 'bodyType', 'residence', 'smoking', 'drinking', 'hobbies', 'personality', 'intro'],
  },
  {
    key: 'ideal',
    title: '이런 분을 만나고 싶어요',
    fields: ['prefAge', 'prefKeywords', 'prefSmoking', 'meetingStyle', 'avoidScope'],
  },
  { key: 'consent', title: '동의', fields: ['agreePrivacy', 'agreeShare'] },
];

export function sectionProgress(form) {
  return SECTIONS.map((s) => {
    const done = s.fields.filter((f) => {
      const v = form[f];
      if (f === 'intro') return (v ?? '').trim().length >= 30;
      if (typeof v === 'boolean') return v;
      return filled(v);
    }).length;
    return { ...s, done, total: s.fields.length };
  });
}
