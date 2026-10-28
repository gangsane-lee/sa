/**
 * 개발 모드 계정 정보 — 서버 없이 브라우저 가짜 데이터로 시험할 때만 쓴다.
 * (운영 서버의 관리자 계정은 server/config/admins.js 에서 관리한다)
 *
 * 사용자 화면 : /login              → 아래 사내 계정 ID(또는 사번) + MOCK_PASSWORD
 * 관리자 화면 : /changeme (별도 주소)  → 관리자 계정으로 로그인 후 MOCK_ADMIN_PASSWORD
 */
export const MOCK_PASSWORD = 'sayeon1234';
export const MOCK_ADMIN_PASSWORD = 'admin!sayeon';

export const TEST_ACCOUNTS = {
  MASTER: 'sayeon.test', // 만능 계정: 신청 완료 + 받은 하트 2개 + 오늘의 후보 + 관리자 계정
  MANAGER: 'jiwon.jung', // 매칭 담당자(인사팀) — 관리자 계정, 신청서 없음
  NEW: 'haneul.kim', // 아직 신청 안 함
  APPLIED: 'doyun.lee', // 신청 완료 · 받은 하트 1개
  RETIRED: 'seojin.park', // 퇴직자 — 로그인 거절 확인용
};

/** 테스트 계정 고르기 화면(LoginView)이 이 순서대로 보여준다 — 누르면 그 계정으로 바로 들어간다 */
export const TEST_ACCOUNT_LIST = [
  { key: 'MASTER', title: '만능 계정', desc: '신청 완료 · 받은 하트 2개 · 오늘의 후보 · 관리자 계정', pick: true },
  { key: 'NEW', title: '신청 전', desc: '소개 화면 · 인연 사주 · 신청서 작성부터' },
  { key: 'APPLIED', title: '신청 완료', desc: '매칭 보드 · 받은 하트 1개' },
  { key: 'MANAGER', title: '매칭 담당자', desc: '관리자 계정 · 신청서 없음' },
  { key: 'RETIRED', title: '퇴직자', desc: '들어가지 못하고 거절되는지 확인' },
];

/** 관리자 계정 (사내 계정 ID 기준) — 이 계정만 관리자 비밀번호로 관리자 화면에 들어갈 수 있다 */
export const ADMIN_ACCOUNTS = [TEST_ACCOUNTS.MANAGER, TEST_ACCOUNTS.MASTER];
