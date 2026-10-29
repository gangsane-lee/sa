/**
 * 오피스 모드 — 사무실에서 화면을 봐도 스프레드시트 작업처럼 보이게 바꾸는 '위장 화면'.
 *  - html.office 클래스 하나로 색·글꼴·배경(셀 격자)을 바꾸고, OfficeChrome이 리본·수식줄·시트 탭을 덧씌운다
 *  - 브라우저 탭 제목·아이콘도 문서처럼 바꾼다
 *  - 단축키 Ctrl+Shift+E 로 즉시 전환 (탭을 닫기 전까지 상태 유지)
 */
import { reactive } from 'vue';

const KEY = 'sasystem.office';
const FAKE_TITLE = '통합 문서1 - 스프레드시트';
// 흰 바탕 초록 격자 아이콘 (특정 제품 로고 아님)
const FAKE_ICON =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Crect x='1' y='1' width='14' height='14' rx='2' fill='%23217346'/%3E%3Cpath d='M4 5h8M4 8h8M4 11h8M7 3v11' stroke='%23fff' stroke-width='1'/%3E%3C/svg%3E";

export const office = reactive({ on: false });
let realTitle = '';
let realIcon = '';

const read = () => {
  try {
    return sessionStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
};
const write = (v) => {
  try {
    sessionStorage.setItem(KEY, v ? '1' : '0');
  } catch {
    /* noop */
  }
};

function iconEl() {
  return document.querySelector("link[rel~='icon']");
}

function apply(on) {
  office.on = on;
  document.documentElement.classList.toggle('office', on);
  const icon = iconEl();
  if (on) {
    realTitle = document.title;
    realIcon = icon?.getAttribute('href') ?? '';
    document.title = FAKE_TITLE;
    icon?.setAttribute('href', FAKE_ICON);
  } else {
    if (realTitle) document.title = realTitle;
    if (icon && realIcon) icon.setAttribute('href', realIcon);
  }
}

export function setOffice(on) {
  apply(on);
  write(on);
}
export const toggleOffice = () => setOffice(!office.on);

/** 라우터가 제목을 바꿀 때: 오피스 모드면 진짜 제목은 기억만 하고 문서 제목을 유지 */
export function setPageTitle(title) {
  if (office.on) realTitle = title;
  else document.title = title;
}

export function initOffice() {
  if (read()) apply(true);
  window.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.shiftKey && (e.key === 'E' || e.key === 'e')) {
      e.preventDefault();
      toggleOffice();
    }
  });
}
