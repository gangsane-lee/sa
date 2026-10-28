/**
 * 기준정보 스토어 — 로그인 후 한 번 불러와 모든 화면이 같이 쓴다.
 * 관리자가 기준정보 탭에서 값을 바꾸면 reloadCodes()로 다시 불러온다.
 */
import { reactive } from 'vue';
import { api } from '@/api';
import { activeItems, codeText, codeTexts, sortedItems, rankOf } from '@shared/utils/codeHelpers';

export const codeStore = reactive({ codes: {}, loaded: false });
let pending = null;

export async function loadCodes() {
  if (codeStore.loaded) return codeStore.codes;
  pending ??= api.codes.list().then((codes) => {
    codeStore.codes = codes;
    codeStore.loaded = true;
    return codes;
  }).finally(() => {
    pending = null;
  });
  return pending;
}

export async function reloadCodes() {
  codeStore.loaded = false;
  return loadCodes();
}

/** 선택지(사용 중인 항목). parent: 상위 코드로 거르기 */
export const options = (group, parent) => activeItems(codeStore.codes, group, parent);
export const allItems = (group) => sortedItems(codeStore.codes, group);
export const ct = (group, value) => codeText(codeStore.codes, group, value);
export const cts = (group, values) => codeTexts(codeStore.codes, group, values);
export const rank = (group, value) => rankOf(codeStore.codes, group, value);
