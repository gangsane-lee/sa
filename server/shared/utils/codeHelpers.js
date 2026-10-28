/**
 * 기준정보 조회 도우미 — 화면(stores/codes.js)·mock API·서버 검증이 함께 쓰는 순수 함수.
 * codes 형태: { [group]: [{ value, text, order, use, parent?, attr? }] }
 */

export const sortedItems = (codes, group) => [...(codes?.[group] ?? [])].sort((a, b) => a.order - b.order);

/** 선택지: 사용 중(use)인 항목만. parent를 주면 그 상위 코드에 속한 항목만 */
export const activeItems = (codes, group, parent) =>
  sortedItems(codes, group).filter((c) => c.use && (parent === undefined || c.parent === parent));

export const findCode = (codes, group, value) => (codes?.[group] ?? []).find((c) => c.value === value);

/** 표시 이름. 삭제된 코드면 값을 그대로 보여준다 */
export const codeText = (codes, group, value) => findCode(codes, group, value)?.text ?? value ?? '';

export const codeTexts = (codes, group, values = []) => values.map((v) => codeText(codes, group, v));

/** 정렬 순서상 몇 번째인지 (키 구간 범위 비교용). 없으면 -1 */
export const rankOf = (codes, group, value) => sortedItems(codes, group).findIndex((c) => c.value === value);

/** 신청서 저장 시 검증: 사용 중인 코드인가 (기존 값 유지는 허용) */
export const isValidCode = (codes, group, value, { allowInactive = false } = {}) => {
  const c = findCode(codes, group, value);
  return Boolean(c && (c.use || allowInactive));
};
