/**
 * 신청서 유효성 규칙 — 화면(DxForm)과 서버(검증 미들웨어)가 같은 기준을 쓰도록 한 곳에 모은다.
 * 서버 구현 시 이 파일을 그대로 가져가 validateApplication()을 재사용하면 된다.
 */
import {
  GENDERS, DIVISIONS, CAREER_LEVELS, WORK_SITES, WORK_PATTERNS, BODY_TYPES, EDUCATIONS, RELIGIONS,
  SMOKING, DRINKING, MBTIS, PREF_SMOKING, MEETING_STYLES, AVOID_SCOPES,
} from '@/constants/codes';

export const THIS_YEAR = new Date().getFullYear();
/** 연 나이(올해 - 출생연도). 소개팅 프로필 관례상 'OO년생'과 함께 표기한다 */
export const ageOf = (birthYear) => (birthYear ? THIS_YEAR - birthYear : null);

export const RULES = {
  name: { pattern: /^([가-힣]{2,10}|[A-Za-z][A-Za-z ]{1,29})$/, message: '한글 2~10자 또는 영문으로 입력해 주세요.' },
  birthYear: { min: THIS_YEAR - 60, max: THIS_YEAR - 19 },
  dept: { pattern: /^[가-힣A-Za-z0-9&·()\s-]{2,30}$/, message: '2~30자로 입력해 주세요. (한글·영문·숫자)' },
  phone: { pattern: /^01[016789]-\d{4}-\d{4}$/, message: '010으로 시작하는 휴대전화 번호 11자리를 입력해 주세요.' },
  email: { pattern: /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/, max: 100 },
  height: { min: 140, max: 210 },
  residence: { min: 2, max: 30 },
  hobbies: { min: 1, max: 5 },
  personality: { min: 1, max: 3 },
  intro: { min: 30, max: 500 },
  prefAge: { min: 20, max: 55 },
  prefKeywords: { min: 1, max: 5 },
  messageToManager: { max: 300 },
};

const inCodes = (list, v) => list.some((c) => c.value === v);
const len = (s) => (s ?? '').trim().length;
const arrBetween = (arr, { min, max }) => Array.isArray(arr) && arr.length >= min && arr.length <= max;

/**
 * 서버 측 최종 검증. 잘못된 항목 이름 배열을 돌려준다(빈 배열이면 통과).
 * @param {object} a API 형식의 신청 데이터 (prefAgeMin/prefAgeMax 사용)
 * @param {{ requireConsent?: boolean }} opt 관리자 수정 시에는 동의 항목을 다시 검사하지 않는다
 */
export function validateApplication(a, { requireConsent = true } = {}) {
  const e = [];
  if (!RULES.name.pattern.test(a.name ?? '')) e.push('이름');
  if (!inCodes(GENDERS, a.gender)) e.push('성별');
  if (!(a.birthYear >= RULES.birthYear.min && a.birthYear <= RULES.birthYear.max)) e.push('출생연도');
  if (!inCodes(DIVISIONS, a.division)) e.push('사업부');
  if (!RULES.dept.pattern.test(a.dept ?? '')) e.push('소속');
  if (!inCodes(CAREER_LEVELS, a.careerLevel)) e.push('직급(CL)');
  if (!inCodes(WORK_SITES, a.workSite)) e.push('근무지');
  if (!inCodes(WORK_PATTERNS, a.workPattern)) e.push('근무 형태');
  if (!RULES.phone.pattern.test(a.phone ?? '')) e.push('휴대전화');
  if (!RULES.email.pattern.test(a.email ?? '') || len(a.email) > RULES.email.max) e.push('이메일');
  if (!(a.height >= RULES.height.min && a.height <= RULES.height.max)) e.push('키');
  if (!inCodes(BODY_TYPES, a.bodyType)) e.push('체형');
  if (len(a.residence) < RULES.residence.min || len(a.residence) > RULES.residence.max) e.push('거주 지역');
  if (a.education && !inCodes(EDUCATIONS, a.education)) e.push('학력');
  if (a.religion && (!a.agreeSensitive || !inCodes(RELIGIONS, a.religion))) e.push('종교(민감정보 동의 필요)');
  if (!inCodes(SMOKING, a.smoking)) e.push('흡연');
  if (!inCodes(DRINKING, a.drinking)) e.push('음주');
  if (a.mbti && !inCodes(MBTIS, a.mbti)) e.push('MBTI');
  if (!arrBetween(a.hobbies, RULES.hobbies)) e.push('취미·관심사');
  if (!arrBetween(a.personality, RULES.personality)) e.push('성격 키워드');
  if (len(a.intro) < RULES.intro.min || len(a.intro) > RULES.intro.max) e.push('자기소개');
  if (!(a.prefAgeMin >= RULES.prefAge.min && a.prefAgeMax <= RULES.prefAge.max && a.prefAgeMin <= a.prefAgeMax)) e.push('선호 나이');
  if (!arrBetween(a.prefKeywords, RULES.prefKeywords)) e.push('이상형 키워드');
  if (!inCodes(PREF_SMOKING, a.prefSmoking)) e.push('상대의 흡연');
  if (!inCodes(MEETING_STYLES, a.meetingStyle)) e.push('첫 만남');
  if (!inCodes(AVOID_SCOPES, a.avoidScope)) e.push('매칭 제외 범위');
  if (len(a.messageToManager) > RULES.messageToManager.max) e.push('담당자에게 한마디');
  if (requireConsent && (!a.agreePrivacy || !a.agreeShare)) e.push('필수 동의');
  return e;
}
