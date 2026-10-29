/* global __SASYSTEM_MOCK__, __SASYSTEM_DEV_API__ */
import { createRouter, createWebHistory } from 'vue-router';
import { session, restoreSession } from '@/stores/session';
import { loadCodes } from '@/stores/codes';
import { setPageTitle } from '@/stores/office';
import { ADMIN_PATH, isTestMode } from '@/config';

const routes = [
  // 입구
  //  운영 모드: '임직원만 이용할 수 있어요' 안내 (인사정보 확인이 안 됐을 때만 온다)
  //  개발 화면: 테스트 계정(사번) 고르기 (처음에는 첫 계정으로 바로 들어가고, 로그아웃하면 여기로 온다)
  //  (빌드 상수를 직접 써야 운영 빌드에 테스트 계정 화면이 들어가지 않는다)
  {
    path: '/login',
    name: 'login',
    component: __SASYSTEM_MOCK__ || __SASYSTEM_DEV_API__ ? () => import('@/views/LoginView.vue') : () => import('@/views/SsoGateView.vue'),
    meta: { public: true, title: isTestMode ? '테스트 계정 고르기' : '임직원 확인' },
  },
  {
    path: '/',
    component: () => import('@/layouts/UserLayout.vue'),
    children: [
      { path: '', name: 'home', component: () => import('@/views/HomeView.vue') },
      { path: 'apply', name: 'apply', component: () => import('@/views/ApplyView.vue'), meta: { title: '신청서' } },
      { path: 'apply/done', name: 'apply-done', component: () => import('@/views/ApplyDoneView.vue'), meta: { title: '신청 완료' } },
      // 마이페이지 = 내 신청서 보기·수정 (오늘의 인연·받은 하트는 홈에서)
      { path: 'me', name: 'mypage', component: () => import('@/views/ApplyView.vue'), meta: { title: '마이페이지' } },
      { path: 'saju', name: 'saju', component: () => import('@/views/SajuView.vue'), meta: { title: '인연 사주' } },
      { path: 'messages', name: 'messages', component: () => import('@/views/MessagesView.vue'), meta: { title: '쪽지함' } },
      { path: 'voc', name: 'voc', component: () => import('@/views/VocView.vue'), meta: { title: '개선의 소리' } },
      { path: 'privacy', name: 'privacy', component: () => import('@/views/PrivacyView.vue'), meta: { title: '개인정보 처리 안내' } },
    ],
  },
  // 관리자 화면 — 사용자 화면과 다른 주소로만 들어온다 (주소는 sasystem.config.js 의 adminPath)
  {
    path: `${ADMIN_PATH}/login`,
    name: 'admin-login',
    component: () => import('@/views/admin/AdminLoginView.vue'),
    meta: { public: true, title: '관리자 로그인' },
  },
  {
    path: ADMIN_PATH,
    component: () => import('@/layouts/AdminLayout.vue'),
    meta: { admin: true },
    children: [
      { path: '', name: 'admin-dashboard', component: () => import('@/views/admin/AdminDashboard.vue'), meta: { title: '대시보드' } },
      { path: 'applicants', name: 'admin-applicants', component: () => import('@/views/admin/AdminApplicants.vue'), meta: { title: '신청자 관리' } },
      { path: 'matching', name: 'admin-matching', component: () => import('@/views/admin/AdminMatching.vue'), meta: { title: '매칭 관리' } },
      { path: 'pending', name: 'admin-pending', component: () => import('@/views/admin/AdminPending.vue'), meta: { title: '매칭 승인 대기' } },
      { path: 'reviews', name: 'admin-reviews', component: () => import('@/views/admin/AdminReviews.vue'), meta: { title: '후기·제재' } },
      { path: 'messages', name: 'admin-messages', component: () => import('@/views/admin/AdminMessages.vue'), meta: { title: '쪽지' } },
      { path: 'voc', name: 'admin-voc', component: () => import('@/views/admin/AdminVoc.vue'), meta: { title: '개선의 소리' } },
      { path: 'settings', name: 'admin-settings', component: () => import('@/views/admin/AdminSettings.vue'), meta: { title: '설정' } },
      { path: 'codes', name: 'admin-codes', component: () => import('@/views/admin/AdminCodes.vue'), meta: { title: '기준정보' } },
      { path: 'audit', name: 'admin-audit', component: () => import('@/views/admin/AdminAuditLog.vue'), meta: { title: '열람 기록' } },
      { path: 'tables', name: 'admin-tables', component: () => import('@/views/admin/AdminTables.vue'), meta: { title: 'DB 표' } },
    ],
  },
  { path: '/:pathMatch(.*)*', redirect: '/' },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior: (to, from, saved) => saved ?? (to.hash ? { el: to.hash, behavior: 'smooth' } : { top: 0 }),
});

/**
 * 화면을 처음 열 때 (restoreSession)
 *  - 가짜 데이터(npm run dev:mock) · 개발 모드(npm run dev): 로그인 화면 없이 첫 테스트 계정(사번)으로 바로 홈
 *  - 운영 모드(npm run build): 사내 인사정보 URL 호출 → 응답을 localStorage 에 저장 → 사번·재직 여부 확인
 *                              → 임직원이면 홈 / 아니면 '임직원만 이용할 수 있어요' 안내(/login)
 *    (인사정보 URL 설정: servers.config.mjs 의 sso.employeeApi, 호출·해석: auth/employee.js · utils/employeeInfo.js)
 */
router.beforeEach(async (to) => {
  if (to.meta.public) return true;
  await restoreSession();
  const adminArea = to.matched.some((r) => r.meta.admin);
  const back = to.fullPath !== '/' ? { redirect: to.fullPath } : {};
  // 관리자 주소로 들어왔으면 관리자 로그인으로, 아니면 사용자 로그인으로
  if (!session.user) return { name: adminArea ? 'admin-login' : 'login', query: back };
  await loadCodes().catch(() => null); // 기준정보(선택 목록) — 실패해도 화면은 열고, 각 화면이 오류를 보여준다
  // 관리자 계정(서버가 판단한 isAdmin) + 관리자 비밀번호 확인(관리자 세션)이 둘 다 있어야 한다
  if (adminArea && !(session.user.isAdmin && session.isAdmin)) return { name: 'admin-login', query: back };
  return true;
});

router.afterEach((to) => {
  setPageTitle(to.meta.title ? `${to.meta.title} · 사緣` : '사緣 · 사내 인연 매칭');
});

export default router;
