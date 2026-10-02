import { createRouter, createWebHistory } from 'vue-router';
import { session, restoreSession } from '@/stores/session';

const routes = [
  {
    path: '/login',
    name: 'login',
    component: () => import('@/views/LoginView.vue'),
    meta: { public: true, title: '임직원 인증' },
  },
  {
    path: '/',
    component: () => import('@/layouts/UserLayout.vue'),
    children: [
      { path: '', name: 'home', component: () => import('@/views/HomeView.vue') },
      { path: 'apply', name: 'apply', component: () => import('@/views/ApplyView.vue'), meta: { title: '신청서' } },
    ],
  },
  {
    path: '/admin',
    component: () => import('@/layouts/AdminLayout.vue'),
    meta: { admin: true },
    children: [
      { path: '', name: 'admin-dashboard', component: () => import('@/views/admin/AdminDashboard.vue'), meta: { title: '대시보드' } },
      { path: 'applicants', name: 'admin-applicants', component: () => import('@/views/admin/AdminApplicants.vue'), meta: { title: '신청자 관리' } },
      { path: 'matching', name: 'admin-matching', component: () => import('@/views/admin/AdminMatching.vue'), meta: { title: '매칭 관리' } },
      { path: 'audit', name: 'admin-audit', component: () => import('@/views/admin/AdminAuditLog.vue'), meta: { title: '열람 기록' } },
    ],
  },
  { path: '/:pathMatch(.*)*', redirect: '/' },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior: (to, from, saved) => saved ?? (to.hash ? { el: to.hash, behavior: 'smooth' } : { top: 0 }),
});

router.beforeEach(async (to) => {
  if (to.meta.public) return true;
  await restoreSession();
  if (!session.user) return { name: 'login', query: to.fullPath !== '/' ? { redirect: to.fullPath } : {} };
  if (to.matched.some((r) => r.meta.admin) && !session.isAdmin) return { name: 'home' };
  return true;
});

router.afterEach((to) => {
  document.title = to.meta.title ? `${to.meta.title} · 사緣` : '사緣 · 사내 인연 매칭';
});

export default router;
