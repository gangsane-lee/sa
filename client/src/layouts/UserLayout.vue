<script setup>
import { ref, computed } from 'vue';
import { useRouter } from 'vue-router';
import { DxButton } from 'devextreme-vue/button';
import { session, logout } from '@/stores/session';
import { DIVISIONS, textOf } from '@/constants/codes';
import SaLogo from '@/components/SaLogo.vue';
import AdminGate from '@/components/AdminGate.vue';

const router = useRouter();
const gateOpen = ref(false);
const user = computed(() => session.user);

function openAdmin() {
  if (session.isAdmin) router.push({ name: 'admin-dashboard' });
  else gateOpen.value = true;
}

async function doLogout() {
  await logout();
  router.replace({ name: 'login' });
}
</script>

<template>
  <div class="shell">
    <header class="top">
      <div class="container top__inner">
        <RouterLink to="/" class="top__brand" aria-label="사緣 홈">
          <SaLogo :height="30" />
        </RouterLink>
        <div class="top__actions">
          <span class="top__who">
            <b>{{ user.name }}</b>님
            <span class="top__dept">{{ textOf(DIVISIONS, user.division) }}</span>
          </span>
          <DxButton
            class="top__btn"
            styling-mode="text"
            icon="lock"
            :text="session.isAdmin ? '관리자 화면' : '관리자'"
            :hint="session.isAdmin ? '관리자 화면으로 이동' : '관리자 비밀번호로 관리자 모드 전환'"
            @click="openAdmin"
          />
          <DxButton class="top__btn" styling-mode="text" text="로그아웃" @click="doLogout" />
        </div>
      </div>
    </header>

    <main>
      <RouterView />
    </main>

    <footer class="foot">
      <div class="container foot__inner">
        <span>사緣은 DS부문 임직원 전용 비공개 서비스예요.</span>
        <span>문의 · 인사팀 사緣 매칭 담당</span>
      </div>
    </footer>

    <AdminGate v-model:visible="gateOpen" />
  </div>
</template>

<style scoped>
.shell {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}
main {
  flex: 1;
}

.top {
  position: sticky;
  top: 0;
  z-index: 20;
  height: var(--header-h);
  background: rgba(245, 244, 248, 0.88);
  backdrop-filter: saturate(1.4) blur(10px);
  border-bottom: 1px solid var(--c-line);
}
.top__inner {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.top__brand {
  display: inline-flex;
  border-radius: var(--r-sm);
}
.top__actions {
  display: flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
}
.top__who {
  margin-right: 8px;
  font-size: 14px;
  color: var(--c-ink-2);
  white-space: nowrap;
}
.top__dept {
  margin-left: 6px;
  color: var(--c-mute);
  font-size: 13px;
}

.foot {
  border-top: 1px solid var(--c-line);
  padding: 22px 0 28px;
  color: var(--c-mute);
  font-size: 13px;
}
.foot__inner {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 6px 24px;
}

@media (max-width: 640px) {
  .top__dept {
    display: none;
  }
  .top__who {
    margin-right: 0;
  }
  .top__btn :deep(.dx-button-text) {
    display: none;
  }
  .top__btn:last-child :deep(.dx-button-text) {
    display: inline;
  }
}
</style>
