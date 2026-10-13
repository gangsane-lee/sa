/**
 * 기준정보 기본값 — 처음 설치할 때 DB(SA_CODE)에 넣는 값이자 mock 모드의 초기 데이터.
 * 운영 중 변경은 관리자 화면 '기준정보' 탭에서 한다.
 *
 * 항목 형태: { value, text, order, use, parent?, attr? }
 *  - value: DB에 저장되는 코드. 만든 뒤에는 바꾸지 않는다(신청서가 이 값을 참조)
 *  - text : 화면 표시 이름. 언제든 바꿔도 된다
 *  - use  : false면 새 신청서 선택지에서 숨긴다(기존 신청서의 표시는 유지)
 *  - attr : 보조 값(캠퍼스 → 권역)
 */

const list = (pairs) => pairs.map(([value, text, extra], i) => ({ value, text, order: (i + 1) * 10, use: true, ...extra }));

const CAMPUSES = [
  ['GIHEUNG', '기흥캠퍼스', { attr: 'GH' }],
  ['HWASEONG', '화성캠퍼스', { attr: 'GH' }],
  ['PYEONGTAEK', '평택캠퍼스', { attr: 'PT' }],
  ['ONYANG', '온양캠퍼스', { attr: 'CN' }],
  ['CHEONAN', '천안캠퍼스', { attr: 'CN' }],
  ['SUWON', '수원 (삼성디지털시티)', { attr: 'GH' }],
  ['SEOCHO', '서초사옥', { attr: 'SEOUL' }],
];

/** 키 구간: 150cm 미만 · 150cm 초반/중반/후반 … 180cm 후반 · 190cm 이상 */
const heights = [['H140', '150cm 미만']];
for (const base of [150, 160, 170, 180]) {
  heights.push([`H${base}E`, `${base}cm 초반`], [`H${base}M`, `${base}cm 중반`], [`H${base}L`, `${base}cm 후반`]);
}
heights.push(['H190', '190cm 이상']);

const MBTI = ['ISTJ', 'ISFJ', 'INFJ', 'INTJ', 'ISTP', 'ISFP', 'INFP', 'INTP', 'ESTP', 'ESFP', 'ENFP', 'ENTP', 'ESTJ', 'ESFJ', 'ENFJ', 'ENTJ'];

const HOBBIES = [
  '러닝', '등산', '헬스', '요가·필라테스', '골프', '테니스', '수영', '캠핑',
  '여행', '맛집 탐방', '카페 투어', '요리·베이킹', '독서', '영화', '드라마·예능', '전시·공연',
  '음악 감상', '악기 연주', '게임', '사진', '반려동물', '드라이브', '와인', '봉사활동',
];

export const DEFAULT_CODES = {
  DIVISION: list([
    ['MEMORY', '메모리사업부'],
    ['LSI', 'System LSI사업부'],
    ['FOUNDRY', '파운드리사업부'],
    ['COMMON', 'DS부문 공통'],
  ]),
  CAMPUS: list(CAMPUSES),
  HEIGHT: list(heights),
  FACE: list([
    ['PUPPY', '강아지상'],
    ['CAT', '고양이상'],
    ['FOX', '여우상'],
    ['RABBIT', '토끼상'],
    ['BEAR', '곰상'],
    ['DEER', '사슴상'],
    ['DINO', '공룡상'],
    ['TOFU', '두부상'],
    ['ARAB', '아랍상'],
    ['WOLF', '늑대상'],
  ]),
  BODY: list([
    ['SLIM', '마른 편'],
    ['SLENDER', '슬림'],
    ['AVERAGE', '보통'],
    ['TONED', '탄탄한 편'],
    ['CHUBBY', '통통한 편'],
    ['BUILT', '건장한 편'],
  ]),
  LOOKS: list([
    ['HIGH', '상'],
    ['MID', '중'],
    ['LOW', '하'],
  ]),
  MBTI: list(MBTI.map((v) => [v, v])),
  HOBBY: list(HOBBIES.map((t, i) => [`HB${String(i + 1).padStart(2, '0')}`, t])),
  DRINKING: list([
    ['NONE', '거의 안 마셔요'],
    ['SOMETIMES', '가끔 즐겨요'],
    ['OFTEN', '자주 즐겨요'],
  ]),
  SMOKING: list([
    ['NON', '비흡연'],
    ['E_CIG', '전자담배'],
    ['SMOKER', '흡연'],
  ]),
  RELIGION: list([
    ['NONE', '무교'],
    ['CHRISTIAN', '기독교'],
    ['CATHOLIC', '천주교'],
    ['BUDDHIST', '불교'],
    ['ETC', '기타'],
  ]),
};
