<script setup>
/**
 * 관리자 모드 레이아웃 — 사용자 화면과 확실히 구분되도록 색과 구조를 바꾼다.
 * 상단 달빛 띠: 기록이 남는다는 경고 + 자동 종료 카운트다운
 */
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { DxButton } from 'devextreme-vue/button';
import notify from 'devextreme/ui/notify';
import { confirm } from 'devextreme/ui/dialog';
import { api, isMock } from '@/api';
import { session, exitAdmin } from '@/stores/session';
import { ADMIN_IDLE_MINUTES } from '@/constants/policy';
import { fmtRemain } from '@/utils/format';
import SaLogo from '@/components/SaLogo.vue';

const route = useRoute();
const router = useRouter();
const now = ref(Date.now());
let timer;

const NAV = [
  { name: 'admin-dashboard', text: '대시보드', icon: 'chart' },
  { name: 'admin-applicants', text: '신청자 관리', icon: 'group' },
  { name: 'admin-matching', text: '매칭 관리', icon: 'link' },
  { name: 'admin-audit', text: '열람 기록', icon: 'clock' },
];

const remainMs = computed(() => session.adminExpiresAt - now.value);
const remain = computed(() => fmtRemain(remainMs.value));
const urgent = computed(() => remainMs.value < 5 * 60 * 1000);

onMounted(() => {
  document.body.classList.add('is-admin');
  timer = setInterval(() => {
    now.value = Date.now();
    if (session.adminExpiresAt && remainMs.value <= 0) expire();
  }, 1000);
});
onBeforeUnmount(() => {
  document.body.classList.remove('is-admin');
  clearInterval(timer);
});

// 서버가 권한 만료를 알려오면(403) 즉시 사용자 화면으로
watch(
  () => session.adminExpiresAt,
  (v) => {
    if (!v) router.replace({ name: 'home' });
  },
);

async function expire() {
  await exitAdmin();
  notify({ message: `${ADMIN_IDLE_MINUTES}분 동안 활동이 없어 관리자 모드를 종료했어요.`, type: 'warning', displayTime: 4000 });
}

async function leave() {
  await exitAdmin();
  notify({ message: '관리자 모드를 종료했어요.', type: 'info', displayTime: 2000 });
}

async function resetMock() {
  const ok = await confirm('가짜 데이터를 처음 상태로 되돌리고 로그아웃할까요?', '개발 모드');
  if (!ok) return;
  api.dev.reset();
  window.location.assign('/login');
}
</script>

<template>
  <div class="admin">
    <div class="band" role="status">
      <span class="band__msg">
        <i class="dx-icon-lock" aria-hidden="true" />
        관리자 모드 · 모든 열람·수정·삭제 기록이 남아요
      </span>
      <span class="band__timer mono" :class="{ 'is-urgent': urgent }" :title="`마지막 작업 후 ${ADMIN_IDLE_MINUTES}분이 지나면 자동 종료돼요`">
        자동 종료까지 {{ remain }}
      </span>
      <DxButton class="band__exit" text="관리자 모드 종료" styling-mode="outlined" @click="leave" />
    </div>

    <div class="body">
      <aside class="side">
        <RouterLink :to="{ name: 'admin-dashboard' }" class="side__brand" aria-label="관리자 대시보드">
          <SaLogo :height="26" tone="light" />
          <span class="side__tag mono">ADMIN</span>
        </RouterLink>
        <nav class="side__nav" aria-label="관리자 메뉴">
          <RouterLink
            v-for="n in NAV"
            :key="n.name"
            :to="{ name: n.name }"
            class="side__link"
            :class="{ 'is-active': route.name === n.name }"
          >
            <i :class="`dx-icon-${n.icon}`" aria-hidden="true" />
            {{ n.text }}
          </RouterLink>
        </nav>
        <div class="side__foot">
          <p class="side__me">
            {{ session.user.name }} · {{ session.user.dept }}<br />
            <span class="mono">{{ session.user.empNo }}</span>
          </p>
          <button v-if="isMock" type="button" class="side__reset" @click="resetMock">가짜 데이터 초기화</button>
        </div>
      </aside>

      <main class="main">
        <h1 class="main__title">{{ route.meta.title }}</h1>
        <RouterView />
      </main>
    </div>
  </div>
</template>

<style scoped>
.admin {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  background: #eeeff4;
}

.band {
  position: sticky;
  top: 0;
  z-index: 30;
  display: flex;
  align-items: center;
  gap: 8px 20px;
  flex-wrap: wrap;
  padding: 8px var(--gutter);
  background: var(--c-moon);
  color: var(--c-moon-ink);
  font-size: 13.5px;
  font-weight: 500;
}
.band__msg {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-right: auto;
}
.band__timer {
  font-size: 13px;
}
.band__timer.is-urgent {
  color: var(--c-crimson-deep);
  font-weight: 600;
}
.band__exit {
  height: 32px;
  border-color: rgba(107, 78, 0, 0.35) !important;
}

.body {
  flex: 1;
  display: grid;
  grid-template-columns: 220px minmax(0, 1fr);
}

.side {
  position: sticky;
  top: 48px;
  height: calc(100vh - 48px);
  display: flex;
  flex-direction: column;
  gap: 24px;
  padding: 22px 14px;
  background: var(--c-indigo);
  color: var(--c-on-indigo);
}
.side__brand {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 8px;
  text-decoration: none;
}
.side__tag {
  padding: 1px 6px;
  border: 1px solid rgba(239, 227, 194, 0.5);
  border-radius: 4px;
  color: var(--c-moon);
  font-size: 11px;
}
.side__nav {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.side__link {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-radius: var(--r-md);
  color: var(--c-on-indigo-mute);
  text-decoration: none;
  font-size: 14.5px;
}
.side__link i {
  font-size: 18px;
  color: inherit;
}
.side__link:hover {
  background: var(--c-indigo-2);
  color: #fff;
}
.side__link.is-active {
  background: var(--c-indigo-3);
  color: #fff;
  box-shadow: inset 3px 0 0 var(--c-thread-on-dark);
}
.side__foot {
  margin-top: auto;
  padding: 0 8px;
  font-size: 12.5px;
  color: var(--c-on-indigo-mute);
}
.side__reset {
  margin-top: 12px;
  padding: 4px 10px;
  border: 1px dashed rgba(169, 171, 208, 0.5);
  border-radius: 999px;
  background: none;
  color: var(--c-on-indigo-mute);
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}

.main {
  min-width: 0;
  padding: 24px clamp(16px, 3vw, 36px) 56px;
}
.main__title {
  margin-bottom: 18px;
  font-size: 22px;
  color: var(--c-indigo);
}

@media (max-width: 900px) {
  .body {
    grid-template-columns: 1fr;
  }
  .side {
    position: static;
    height: auto;
    flex-direction: row;
    align-items: center;
    gap: 12px;
    padding: 10px var(--gutter);
    overflow-x: auto;
  }
  .side__nav {
    flex-direction: row;
  }
  .side__link {
    white-space: nowrap;
    padding: 8px 10px;
  }
  .side__foot {
    display: none;
  }
}
</style>
