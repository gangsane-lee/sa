/**
 * 공통 코드 — 화면 선택지, mock 데이터, 서버 유효성 검사가 모두 이 목록을 기준으로 한다.
 * 삼성전자 DS부문 기준. 조직 개편 시 이 파일만 고치면 된다.
 * (DB에는 value 코드만 저장되므로 text는 자유롭게 바꿔도 된다. value를 바꿀 때는 DB 데이터도 함께 이관)
 */

const byValue = (list) => Object.fromEntries(list.map((c) => [c.value, c]));
export const textOf = (list, value) => list.find((c) => c.value === value)?.text ?? value ?? '';

export const GENDERS = [
  { value: 'M', text: '남성' },
  { value: 'F', text: '여성' },
];

/** 사업부 — DX부문(MX·VD·DA 등)까지 대상으로 넓히려면 여기에 추가 */
export const DIVISIONS = [
  { value: 'MEMORY', text: '메모리사업부' },
  { value: 'LSI', text: 'System LSI사업부' },
  { value: 'FOUNDRY', text: '파운드리사업부' },
  { value: 'COMMON', text: 'DS부문 공통' },
];

/** 직급 (Career Level) */
export const CAREER_LEVELS = [
  { value: 'CL1', text: 'CL1' },
  { value: 'CL2', text: 'CL2' },
  { value: 'CL3', text: 'CL3' },
  { value: 'CL4', text: 'CL4' },
];

/** 근무지 — region이 같으면 '가까운 근무지'로 보고 매칭 점수에 반영 */
export const WORK_SITES = [
  { value: 'GIHEUNG', text: '기흥캠퍼스', region: 'GH' },
  { value: 'HWASEONG', text: '화성캠퍼스', region: 'GH' },
  { value: 'PYEONGTAEK', text: '평택캠퍼스', region: 'PT' },
  { value: 'ONYANG', text: '온양캠퍼스', region: 'CN' },
  { value: 'CHEONAN', text: '천안캠퍼스', region: 'CN' },
  { value: 'SUWON', text: '수원 (삼성디지털시티)', region: 'GH' },
  { value: 'SEOCHO', text: '서초사옥', region: 'SEOUL' },
  { value: 'ETC', text: '기타', region: null },
];
export const WORK_SITE_MAP = byValue(WORK_SITES);

/** 근무 형태 — 교대 근무자는 만날 수 있는 시간대가 달라서 매칭에 참고 */
export const WORK_PATTERNS = [
  { value: 'DAY', text: '주간 근무' },
  { value: 'SHIFT', text: '교대 근무' },
  { value: 'FLEX', text: '자율 출퇴근' },
];

export const BODY_TYPES = [
  { value: 'SLIM', text: '마른 편' },
  { value: 'SLENDER', text: '슬림' },
  { value: 'AVERAGE', text: '보통' },
  { value: 'TONED', text: '탄탄한 편' },
  { value: 'CHUBBY', text: '통통한 편' },
  { value: 'BUILT', text: '건장한 편' },
];

export const EDUCATIONS = [
  { value: 'HIGH', text: '고등학교 졸업' },
  { value: 'COLLEGE', text: '전문대 졸업' },
  { value: 'UNIV', text: '대학교 졸업' },
  { value: 'MASTER', text: '석사' },
  { value: 'DOCTOR', text: '박사' },
];

/** 종교는 민감정보 — 별도 동의(agreeSensitive)가 있을 때만 저장 */
export const RELIGIONS = [
  { value: 'NONE', text: '무교' },
  { value: 'CHRISTIAN', text: '기독교' },
  { value: 'CATHOLIC', text: '천주교' },
  { value: 'BUDDHIST', text: '불교' },
  { value: 'ETC', text: '기타' },
];

export const SMOKING = [
  { value: 'NON', text: '비흡연' },
  { value: 'E_CIG', text: '전자담배' },
  { value: 'SMOKER', text: '흡연' },
];

export const DRINKING = [
  { value: 'NONE', text: '거의 안 마셔요' },
  { value: 'SOMETIMES', text: '가끔 즐겨요' },
  { value: 'OFTEN', text: '자주 즐겨요' },
];

export const MBTIS = [
  'ISTJ', 'ISFJ', 'INFJ', 'INTJ', 'ISTP', 'ISFP', 'INFP', 'INTP',
  'ESTP', 'ESFP', 'ENFP', 'ENTP', 'ESTJ', 'ESFJ', 'ENFJ', 'ENTJ',
].map((v) => ({ value: v, text: v }));

export const HOBBIES = [
  '러닝', '등산', '헬스', '요가·필라테스', '골프', '테니스', '수영', '캠핑',
  '여행', '맛집 탐방', '카페 투어', '요리·베이킹', '독서', '영화', '드라마·예능', '전시·공연',
  '음악 감상', '악기 연주', '게임', '사진', '반려동물', '드라이브', '와인', '봉사활동',
];

export const PERSONALITIES = [
  '다정한', '유머러스한', '차분한', '활발한', '섬세한', '계획적인',
  '즉흥적인', '진중한', '긍정적인', '솔직한', '배려심 깊은', '호기심 많은',
];

export const IDEAL_KEYWORDS = [
  '대화가 잘 통하는', '잘 웃는', '성실한', '자기관리 하는', '취미를 함께할',
  '가치관이 비슷한', '배려심 있는', '유머 감각 있는', '책임감 있는', '차분한',
  '밝은 에너지', '연락이 꾸준한',
];

export const PREF_SMOKING = [
  { value: 'ANY', text: '상관없어요' },
  { value: 'NON', text: '비흡연자였으면 해요' },
];

export const MEETING_STYLES = [
  { value: 'LUNCH', text: '점심 식사' },
  { value: 'DINNER', text: '퇴근 후 저녁' },
  { value: 'WEEKEND', text: '주말 카페' },
  { value: 'ANY', text: '상관없어요' },
];

/** 매칭에서 제외할 범위 — 매일 마주치는 사이는 부담스러울 수 있어서 */
export const AVOID_SCOPES = [
  { value: 'TEAM', text: '같은 팀만 피할래요' },
  { value: 'DIVISION', text: '같은 사업부도 피할래요' },
  { value: 'NONE', text: '상관없어요' },
];

/** 신청 상태 (관리자가 변경) */
export const APPLY_STATUS = [
  { value: 'RECEIVED', text: '접수', userText: '접수되었어요. 매칭 담당자가 곧 확인할 거예요.' },
  { value: 'REVIEWING', text: '검토 중', userText: '매칭 담당자가 어울리는 분을 찾고 있어요.' },
  { value: 'MATCHING', text: '매칭 중', userText: '어울리는 분께 조심스럽게 의사를 묻고 있어요.' },
  { value: 'MATCHED', text: '매칭 완료', userText: '인연이 닿았어요! 담당자가 곧 연락드릴게요.' },
  { value: 'HOLD', text: '보류', userText: '잠시 매칭을 쉬고 있어요. 궁금한 점은 담당자에게 문의해 주세요.' },
];
export const APPLY_STATUS_MAP = byValue(APPLY_STATUS);

/** 매칭 상태 */
export const MATCH_STATUS = [
  { value: 'PROPOSED', text: '제안됨' },
  { value: 'ACCEPTED', text: '양측 수락' },
  { value: 'MET', text: '만남 완료' },
  { value: 'DECLINED', text: '불발' },
];
export const ACTIVE_MATCH_STATUS = ['PROPOSED', 'ACCEPTED', 'MET'];

/** 관리자 열람 기록 행위 */
export const AUDIT_ACTIONS = [
  { value: 'ADMIN_ENTER', text: '관리자 모드 진입' },
  { value: 'ADMIN_ENTER_FAIL', text: '관리자 인증 실패' },
  { value: 'ADMIN_EXIT', text: '관리자 모드 종료' },
  { value: 'REVEAL_PII', text: '연락처 전체 표시' },
  { value: 'VIEW_APPLICANT', text: '신청자 상세 열람' },
  { value: 'UPDATE_APPLICANT', text: '신청자 정보 수정' },
  { value: 'STATUS_CHANGE', text: '상태 변경' },
  { value: 'DELETE_APPLICANT', text: '신청자 삭제' },
  { value: 'EXPORT', text: '엑셀 내려받기' },
  { value: 'MATCH_CREATE', text: '매칭 제안' },
  { value: 'MATCH_UPDATE', text: '매칭 상태 변경' },
  { value: 'MATCH_DELETE', text: '매칭 삭제' },
];
