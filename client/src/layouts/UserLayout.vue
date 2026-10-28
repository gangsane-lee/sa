<script setup>
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { DxButton } from 'devextreme-vue/button';
import { watch } from 'vue';
import { useRoute } from 'vue-router';
import { session, logout, unread, refreshUnread } from '@/stores/session';
import GatheringPopup from '@/components/GatheringPopup.vue';
import { setOffice } from '@/stores/office';
import { ct } from '@/stores/codes';
import { USER_STATUS_MAP } from '@shared/constants/codes';
import SaLogo from '@/components/SaLogo.vue';

const router = useRouter();
const route = useRoute();
// 화면을 옮길 때마다 안 읽은 쪽지 수를 다시 센다
watch(() => route.fullPath, refreshUnread, { immediate: true });
const user = computed(() => session.user);
const statusKey = computed(() => user.value?.applicant?.userStatus ?? 'GUEST');
const statusText = computed(() => (statusKey.value === 'GUEST' ? '신청 전' : USER_STATUS_MAP[statusKey.value]?.text ?? ''));

async function doLogout() {
  await logout();
  router.replace({ name: 'login' });
}
</script>

<template>
  <div class="shell">
    <header class="top">
      <div class="container top__inner">
        <div class="top__left">
          <RouterLink to="/" class="top__brand" aria-label="사緣 홈">
            <SaLogo :height="30" />
          </RouterLink>
          <nav class="nav" aria-label="주 메뉴">
            <RouterLink :to="{ name: 'home' }" class="nav__link">홈</RouterLink>
            <RouterLink :to="{ name: 'saju' }" class="nav__link">인연 사주</RouterLink>
            <RouterLink :to="{ name: 'messages' }" class="nav__link">
              쪽지함<span v-if="unread.count" class="nav__badge">{{ unread.count }}</span>
            </RouterLink>
            <RouterLink :to="{ name: 'mypage' }" class="nav__link">마이페이지</RouterLink>
            <RouterLink :to="{ name: 'voc' }" class="nav__link nav__link--sub">개선의 소리</RouterLink>
          </nav>
        </div>
        <div class="top__actions">
          <span class="top__who">
            <b>{{ user?.name }}</b>님
            <span class="top__dept">{{ ct('DIVISION', user?.division) }}</span>
            <!-- 서버가 알려준 신청 상태로 구분: 신청 전 / 매칭 대기 중 / 매칭 중 / 커플 성사 -->
            <span class="top__status" :class="`is-${statusKey}`">{{ statusText }}</span>
          </span>
          <DxButton
            class="top__btn top__office"
            styling-mode="outlined"
            icon="exportxlsx"
            text="엑셀 모드"
            hint="스프레드시트처럼 보이는 화면으로 바꿔요 (Ctrl+Shift+E)"
            @click="setOffice(true)"
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
        <span>
          <RouterLink :to="{ name: 'privacy' }" class="foot__link"><b>개인정보 처리 안내</b></RouterLink> ·
          <RouterLink :to="{ name: 'voc' }" class="foot__link">개선의 소리</RouterLink>
        </span>
      </div>
    </footer>

    <GatheringPopup />
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
.top__left {
  display: flex;
  align-items: center;
  gap: clamp(12px, 3vw, 32px);
  min-width: 0;
}
.nav {
  display: flex;
  gap: 4px;
}
.nav__link {
  padding: 6px 10px;
  border-radius: var(--r-sm);
  color: var(--c-ink-2);
  font-size: 14.5px;
  font-weight: 500;
  text-decoration: none;
  white-space: nowrap;
}
.nav__badge {
  display: inline-grid;
  place-items: center;
  min-width: 18px;
  height: 18px;
  margin-left: 4px;
  padding: 0 5px;
  border-radius: 999px;
  background: var(--c-crimson);
  color: #fff;
  font-size: 11px;
  vertical-align: 1px;
}
.nav__link:hover {
  color: var(--c-crimson-deep);
}
.nav__link.router-link-exact-active {
  color: var(--c-crimson-deep);
  background: var(--c-blush-soft);
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
.top__status {
  margin-left: 8px;
  padding: 1px 9px;
  border-radius: 999px;
  background: #eef0f6;
  color: var(--c-ink-2);
  font-size: 12px;
  font-weight: 600;
}
.top__status.is-WAITING {
  background: var(--c-blush-soft);
  color: var(--c-crimson-deep);
}
.top__status.is-MATCHING,
.top__status.is-COUPLED {
  background: var(--c-crimson);
  color: #fff;
}

.foot {
  border-top: 1px solid var(--c-line);
  padding: 22px 0 28px;
  color: var(--c-mute);
  font-size: 13px;
}
.foot__link {
  color: inherit;
  text-underline-offset: 3px;
}
.foot__inner {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 6px 24px;
}

@media (max-width: 760px) {
  .nav__link--sub {
    display: none;
  }
}
@media (max-width: 640px) {
  .top__dept,
  .top__who {
    display: none;
  }
  .nav__link {
    padding: 6px 6px;
    font-size: 13.5px;
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
  /* 좁은 화면: 1줄 = 로고 + 버튼, 2줄 = 메뉴 */
  .top {
    height: auto;
  }
  .top__inner {
    flex-wrap: wrap;
    row-gap: 2px;
    padding-top: 8px;
    padding-bottom: 6px;
  }
  .top__left {
    display: contents;
  }
  .top__brand {
    order: 1;
  }
  .top__actions {
    order: 2;
    margin-left: auto;
  }
  .nav {
    order: 3;
    width: 100%;
    overflow-x: auto;
  }
  .nav__link {
    white-space: nowrap;
  }
}
</style>
