/**
 * 고정 코드 — 시스템 동작과 묶여 있어 관리자가 바꾸면 안 되는 값만 둔다.
 * 사업부·캠퍼스·MBTI·얼굴상 같은 선택 목록은 '기준정보'(DB, 관리자 화면에서 수정)로 옮겼다.
 *   → 기본값: constants/defaultCodes.js, 화면에서 쓰는 법: stores/codes.js
 */

const byValue = (list) => Object.fromEntries(list.map((c) => [c.value, c]));
export const textOf = (list, value) => list.find((c) => c.value === value)?.text ?? value ?? '';

export const GENDERS = [
  { value: 'M', text: '남성' },
  { value: 'F', text: '여성' },
];

/**
 * 기준정보 그룹 — 관리자 '기준정보' 탭의 왼쪽 목록
 *  - parent: 상위 그룹(건물 → 캠퍼스)
 *  - attrLabel: 보조 값 칸 이름(없으면 칸을 숨김)
 */
export const CODE_GROUPS = [
  { value: 'DIVISION', text: '사업부' },
  { value: 'CAMPUS', text: '캠퍼스', attrLabel: '권역(같으면 가까운 캠퍼스)' },
  { value: 'HEIGHT', text: '키 구간', note: '순서(order)대로 범위를 비교해요. 낮은 키부터 차례로 두세요.' },
  { value: 'FACE', text: '얼굴상' },
  { value: 'BODY', text: '체형' },
  { value: 'LOOKS', text: '외모' },
  { value: 'MBTI', text: 'MBTI' },
  { value: 'HOBBY', text: '취미' },
  { value: 'DRINKING', text: '음주' },
  { value: 'SMOKING', text: '흡연' },
  { value: 'RELIGION', text: '종교', note: '민감정보 — 별도 동의한 신청자만 저장해요.' },
];
export const CODE_GROUP_MAP = byValue(CODE_GROUPS);

/** 연상·연하·동갑 선호 (출생연도 기준) */
export const AGE_GAP = [
  { value: 'OLDER', text: '연상' },
  { value: 'SAME', text: '동갑' },
  { value: 'YOUNGER', text: '연하' },
];

/** 진지한 만남 여부 (필수) — 서로 같으면 추천 점수를 더하고, 다르면 뺀다 */
export const SERIOUSNESS = [
  { value: 'Y', text: '네, 진지한 만남을 원해요', short: '진지한 만남' },
  { value: 'N', text: '아니요, 가볍게 알아가고 싶어요', short: '가볍게 시작' },
];

/** 같은 팀·건물·사업부 피하기 (여러 개 선택) */
export const AVOID_OPTIONS = [
  { value: 'TEAM', text: '같은 팀' },
  { value: 'BUILDING', text: '같은 건물' },
  { value: 'DIVISION', text: '같은 사업부' },
];

/**
 * 선호 항목 — 신청서 '선호' 섹션과 우선순위 선택지
 *  key: 신청서 필드, group: 기준정보 그룹, kind: range(범위) | multi(여러 개)
 */
export const PREF_ITEMS = [
  { value: 'AGE', text: '나이', kind: 'range' },
  { value: 'AGEGAP', text: '연상·연하', kind: 'multi', key: 'prefAgeGap', fixed: 'AGE_GAP' },
  { value: 'HEIGHT', text: '키', kind: 'range', group: 'HEIGHT' },
  { value: 'DIVISION', text: '사업부', kind: 'multi', key: 'prefDivisions', group: 'DIVISION' },
  { value: 'FACE', text: '얼굴상', kind: 'multi', key: 'prefFaces', group: 'FACE' },
  { value: 'HOBBY', text: '취미', kind: 'multi', key: 'prefHobbies', group: 'HOBBY' },
  { value: 'DRINKING', text: '음주', kind: 'multi', key: 'prefDrinking', group: 'DRINKING' },
  { value: 'MBTI', text: 'MBTI', kind: 'multi', key: 'prefMbtis', group: 'MBTI' },
  { value: 'RELIGION', text: '종교', kind: 'multi', key: 'prefReligions', group: 'RELIGION' },
  { value: 'SMOKING', text: '흡연', kind: 'multi', key: 'prefSmoking', group: 'SMOKING' },
  { value: 'BODY', text: '체형', kind: 'multi', key: 'prefBodies', group: 'BODY' },
];
export const PREF_ITEM_MAP = byValue(PREF_ITEMS);
export const MAX_PRIORITIES = 5;

/** 매칭 하루 정책 */
export const DAILY_CARD_LIMIT = 3; // 하루에 볼 수 있는 후보 수
export const DAILY_HEART_LIMIT = 1; // 하루에 보낼 수 있는 하트 수
export const RESHOW_AFTER_DAYS = 30; // 한 번 본 후보는 이 기간 동안 다시 보여주지 않는다

/**
 * 신청자 본인에게 보여주는 상태 — 딱 두 가지.
 * 내부 상태(접수·검토·보류·거절 등)는 본인에게 노출하지 않고 '매칭 대기 중'으로 보인다.
 */
export const USER_STATUS = [
  { value: 'WAITING', text: '매칭 대기 중', userText: '어울리는 인연을 기다리고 있어요. 매일 새 후보가 도착해요.' },
  { value: 'MATCHING', text: '매칭 중', userText: '서로 마음이 닿았어요! 쪽지함에서 먼저 인사를 건네보세요.' },
  { value: 'COUPLED', text: '커플 성사', userText: '축하해요! 두 분의 인연이 이어졌어요. 사緣은 여기서 조용히 응원할게요.' },
];
export const USER_STATUS_MAP = byValue(USER_STATUS);

/** 신청 상태 (관리자용 내부 상태) */
export const APPLY_STATUS = [
  { value: 'RECEIVED', text: '접수' },
  { value: 'REVIEWING', text: '검토 중' },
  { value: 'MATCHING', text: '매칭 중' },
  { value: 'MATCHED', text: '매칭 완료' },
  { value: 'COUPLED', text: '커플 완료' },
  { value: 'HOLD', text: '보류' },
];
export const APPLY_STATUS_MAP = byValue(APPLY_STATUS);
/**
 * 관리자가 직접 지정할 수 있는 상태. 매칭 중·매칭 완료·커플 완료는 매칭 상태에서 저절로 정해진다
 * (매칭 없이 '매칭 중'을 지정하면 본인 화면이 상대 없는 매칭 중에 갇혀 새 후보·하트·신청서 수정이 모두 막힌다)
 */
export const MANUAL_APPLY_STATUS = ['RECEIVED', 'REVIEWING', 'HOLD'];
/** 일일 후보로 추천할 수 있는 신청 상태 */
export const RECOMMENDABLE_STATUS = ['RECEIVED', 'REVIEWING'];

/** 매칭 상태 */
export const MATCH_STATUS = [
  { value: 'PROPOSED', text: '제안됨' },
  { value: 'ACCEPTED', text: '양측 수락' },
  { value: 'MET', text: '만남 완료' },
  { value: 'DECLINED', text: '불발' },
  { value: 'CLOSED', text: '종료(재매칭)' },
  { value: 'COUPLE', text: '커플 성사(최종 완료)' },
];
/** 진행 중인 매칭 — 이 상태면 두 사람 모두 '매칭 중'이고 신청서 수정이 잠긴다 */
export const ACTIVE_MATCH_STATUS = ['PROPOSED', 'ACCEPTED', 'MET'];
/** 후기를 쓸 수 있는 매칭 (서로 수락한 적이 있는 매칭) */
export const REVIEWABLE_MATCH_STATUS = ['ACCEPTED', 'MET', 'CLOSED', 'DECLINED', 'COUPLE'];
export const REVIEW_WINDOW_DAYS = 30; // 매칭 후 이 기간 안에만 후기 작성

/** 후기 — 만남 결과 */
export const REVIEW_OUTCOMES = [
  { value: 'MET', text: '만났어요' },
  { value: 'NOSHOW', text: '상대가 나오지 않았어요 (노쇼)' },
  { value: 'NOT_MET', text: '일정이 안 맞아 못 만났어요' },
  { value: 'NO_CONTACT', text: '연락이 닿지 않았어요' },
];
/** 후기 — 상대 평가 (상대에게는 절대 공개하지 않는다) */
export const REVIEW_RATINGS = [
  { value: 'LIKE', text: '좋았어요' },
  { value: 'DISLIKE', text: '별로였어요' },
];

/** 시스템 개선의 소리(VOC) */
export const VOC_CATEGORIES = [
  { value: 'FEATURE', text: '기능 제안' },
  { value: 'MATCHING', text: '매칭 품질' },
  { value: 'BUG', text: '오류 신고' },
  { value: 'PRIVACY', text: '개인정보·보안' },
  { value: 'ETC', text: '기타' },
];
export const VOC_STATUS = [
  { value: 'RECEIVED', text: '접수' },
  { value: 'REVIEWING', text: '검토 중' },
  { value: 'DONE', text: '반영 완료' },
  { value: 'HOLD', text: '보류' },
];

/** 관리자 설정 기본값 (관리자 '설정' 화면에서 변경) */
export const DEFAULT_SETTINGS = {
  showDivisionRatio: true, // 대시보드 '사업부별 신청 비율' 차트 표시
  dislikeLimit: 5, // 받은 '싫어요'가 이 수 이상이면 매칭에서 제외
  noShowCountsAsDislike: true, // 노쇼 신고도 싫어요 1회로 센다
  gatheringPopup: true, // 로그인 시 '곧 매칭이 시작돼요' 팝업 (숫자는 보여주지 않는다)
  holdUntilStart: false, // true면 오픈 전까지 오늘의 인연·사주 인연을 열지 않는다
  messageBurstLimit: 3, // 상대 답장 없이 연속으로 보낼 수 있는 쪽지 수
};

/** 기준정보 일괄 변경 파일(엑셀·JSON) 표시 */
export const REFERENCE_KIND = 'sasystem-reference';

/** 설정 항목의 이름·형식·범위 — 설정 저장과 기준정보 일괄 변경(엑셀·JSON)이 같은 규칙으로 검사한다 */
export const SETTING_ITEMS = [
  { key: 'showDivisionRatio', text: '대시보드 사업부별 신청 비율 표시', type: 'bool' },
  { key: 'dislikeLimit', text: '싫어요 누적 매칭 제외 기준(회)', type: 'int', min: 1, max: 50 },
  { key: 'noShowCountsAsDislike', text: '노쇼 신고를 싫어요 1회로 셈', type: 'bool' },
  { key: 'gatheringPopup', text: "로그인 시 '곧 매칭이 시작돼요' 팝업", type: 'bool' },
  { key: 'holdUntilStart', text: '오픈 전 매칭 멈춤', type: 'bool' },
  { key: 'messageBurstLimit', text: '답장 없이 연속으로 보낼 수 있는 쪽지 수', type: 'int', min: 1, max: 20 },
];

/** 'Y'/'N', true/false, 1/0, 사용/미사용, O/X → true/false (알 수 없으면 null) */
export function toBool(v) {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v === 1 ? true : v === 0 ? false : null;
  const s = String(v ?? '').trim().toUpperCase();
  if (['Y', 'YES', 'TRUE', '1', 'O', '사용', '예', '표시', '켬', 'ON'].includes(s)) return true;
  if (['N', 'NO', 'FALSE', '0', 'X', '미사용', '사용 안 함', '아니오', '숨김', '끔', 'OFF'].includes(s)) return false;
  return null;
}

export const MATCH_SOURCES = [
  { value: 'ADMIN', text: '담당자 제안' },
  { value: 'HEART', text: '하트 맞교환' },
];

/** 관리자 열람 기록 행위 */
export const AUDIT_ACTIONS = [
  { value: 'ADMIN_ENTER', text: '관리자 모드 진입' },
  { value: 'ADMIN_ENTER_FAIL', text: '관리자 인증 실패' },
  { value: 'ADMIN_EXIT', text: '관리자 모드 종료' },
  { value: 'REVEAL_PII', text: '이름 전체 표시' },
  { value: 'VIEW_APPLICANT', text: '신청자 상세 열람' },
  { value: 'UPDATE_APPLICANT', text: '신청자 정보 수정' },
  { value: 'STATUS_CHANGE', text: '상태 변경' },
  { value: 'DELETE_APPLICANT', text: '신청자 삭제' },
  { value: 'EXPORT', text: '엑셀 내려받기' },
  { value: 'MATCH_CREATE', text: '매칭 제안' },
  { value: 'MATCH_UPDATE', text: '매칭 상태 변경' },
  { value: 'MATCH_DELETE', text: '매칭 삭제' },
  { value: 'CODE_CHANGE', text: '기준정보 변경' },
  { value: 'REFERENCE_IMPORT', text: '기준정보 일괄 변경' },
  { value: 'VIEW_REVIEWS', text: '후기 열람' },
  { value: 'SANCTION_RESET', text: '싫어요 제재 해제' },
  { value: 'VOC_UPDATE', text: '개선의 소리 처리' },
  { value: 'VIEW_MESSAGES', text: '쪽지 열람' },
  { value: 'BLACKLIST_ADD', text: '블랙리스트 등록' },
  { value: 'BLACKLIST_REMOVE', text: '블랙리스트 해제' },
  { value: 'SETTINGS_CHANGE', text: '설정 변경' },
  { value: 'MESSAGE_SEND', text: '쪽지 보냄' },
  { value: 'DATA_EDIT', text: 'DB 표 행 추가·수정' },
  { value: 'DATA_DELETE', text: 'DB 표 행 삭제' },
  { value: 'DATA_PURGE_TEST', text: '테스트 데이터 지우기' },
];
