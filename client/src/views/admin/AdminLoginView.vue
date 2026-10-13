<script setup>
/**
 * 관리자 로그인 — 사용자 화면과 다른 주소(기본 /changeme/login)로만 들어온다.
 *  1) 사내 계정 확인 (SSO로 이미 확인됐으면 건너뜀)
 *  2) 관리자 계정인지 서버가 판단 (운영: server/config/admins.js · test: api/mock/accounts.js)
 *  3) 관리자 비밀번호 확인 → 관리자 화면
 * 비밀번호 검증·실패 횟수 제한·잠금은 서버가 하고, 이 화면은 결과만 보여준다.
 */
import { ref, computed, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { DxTextBox } from 'devextreme-vue/text-box';
import { DxButton } from 'devextreme-vue/button';
import { session, restoreSession, login, logout, enterAdmin } from '@/stores/session';
import { isTestMode, ADMIN_PATH } from '@/config';
import SaLogo from '@/components/SaLogo.vue';

const route = useRoute();
const router = useRouter();
const ready = ref(false);
const account = ref('');
const password = ref('');
const adminPassword = ref('');
const error = ref('');
const busy = ref(false);

/** account: 사내 계정 확인 전 · admin: 관리자 비밀번호 · denied: 관리자 계정이 아님 */
const step = computed(() => (!session.user ? 'account' : session.user.isAdmin ? 'admin' : 'denied'));

function goInside() {
  const r = route.query.redirect;
  router.replace(typeof r === 'string' && r.startsWith(ADMIN_PATH) && !r.startsWith(`${ADMIN_PATH}/login`) ? r : { name: 'admin-dashboard' });
}

onMounted(async () => {
  await restoreSession(); // 운영에서는 사내 SSO로 자동 확인
  if (session.user?.isAdmin && session.isAdmin) return goInside();
  ready.value = true;
});

async function run(fn) {
  busy.value = true;
  error.value = '';
  try {
    await fn();
  } catch (e) {
    error.value = e.message;
  } finally {
    busy.value = false;
  }
}

const submitAccount = () =>
  run(async () => {
    await login(account.value.trim(), password.value);
    password.value = '';
  });

const submitAdmin = () =>
  run(async () => {
    if (!adminPassword.value) throw new Error('관리자 비밀번호를 입력해 주세요.');
    try {
      await enterAdmin(adminPassword.value);
    } finally {
      adminPassword.value = '';
    }
    goInside();
  });

const switchAccount = () =>
  run(async () => {
    await logout();
    account.value = '';
  });

/** test 모드 계정 채우기 — VITE_INCLUDE_MOCK=false 빌드에서는 import 자체가 사라진다 */
const loadAccounts = () => (import.meta.env.VITE_INCLUDE_MOCK !== 'false' ? import('@/api/mock/accounts.js') : Promise.resolve(null));
async function fillTest() {
  const a = isTestMode ? await loadAccounts() : null;
  if (!a) return;
  if (step.value === 'account') {
    account.value = a.TEST_ACCOUNTS.MANAGER;
    password.value = a.MOCK_PASSWORD;
  } else adminPassword.value = a.MOCK_ADMIN_PASSWORD;
}
</script>

<template>
  <div class="al">
    <div class="al__band">
      <span>관리자 전용 · 들어오고 나가는 기록과 모든 열람·수정 기록이 남아요</span>
    </div>
    <main class="al__main">
      <div v-if="ready" class="card">
        <div class="card__brand">
          <SaLogo :height="30" />
          <span class="card__tag mono">ADMIN</span>
        </div>

        <!-- 1) 사내 계정 -->
        <form v-if="step === 'account'" class="card__form" novalidate @submit.prevent="submitAccount">
          <h1 class="card__title">관리자 로그인</h1>
          <p class="card__sub">먼저 사내 계정으로 본인을 확인해요. 관리자로 등록된 계정만 다음 단계로 넘어가요.</p>
          <label class="field" for="al-account">사내 계정 ID 또는 사번</label>
          <DxTextBox v-model:value="account" :input-attr="{ id: 'al-account', autocomplete: 'username' }" placeholder="예: gildong.hong" />
          <label class="field" for="al-pw">비밀번호</label>
          <DxTextBox v-model:value="password" mode="password" :input-attr="{ id: 'al-pw', autocomplete: 'current-password' }" @enter-key="submitAccount" />
          <p v-if="error" class="card__error" role="alert">{{ error }}</p>
          <DxButton text="사내 계정 확인" type="default" width="100%" class="card__submit" :disabled="busy" @click="submitAccount" />
        </form>

        <!-- 2) 관리자 비밀번호 -->
        <form v-else-if="step === 'admin'" class="card__form" novalidate @submit.prevent="submitAdmin">
          <h1 class="card__title">관리자 모드</h1>
          <p class="card__sub">
            <b>{{ session.user.name }}</b>님({{ session.user.adId || session.user.empNo }}) · 관리자 비밀번호를 입력하면 관리 화면으로 들어가요.
          </p>
          <label class="field" for="al-admin">관리자 비밀번호</label>
          <DxTextBox v-model:value="adminPassword" mode="password" :input-attr="{ id: 'al-admin', autocomplete: 'off' }" @enter-key="submitAdmin" />
          <p v-if="error" class="card__error" role="alert">{{ error }}</p>
          <DxButton text="관리자 모드로 들어가기" type="default" width="100%" class="card__submit" :disabled="busy" @click="submitAdmin" />
          <button type="button" class="card__link" :disabled="busy" @click="switchAccount">다른 계정으로 로그인</button>
        </form>

        <!-- 관리자 계정이 아님 -->
        <div v-else class="card__form">
          <h1 class="card__title">관리자 계정이 아니에요</h1>
          <p class="card__sub">
            <b>{{ session.user.name }}</b>님 계정은 관리자로 등록되어 있지 않아요. 관리자 등록은 매칭 담당자에게 문의해 주세요.
          </p>
          <DxButton text="다른 계정으로 로그인" type="default" width="100%" class="card__submit" :disabled="busy" @click="switchAccount" />
          <RouterLink :to="{ name: 'home' }" class="card__link">사용자 화면으로 가기</RouterLink>
        </div>

        <button v-if="isTestMode && step !== 'denied'" type="button" class="card__dev" @click="fillTest">
          테스트 운영 · {{ step === 'account' ? '관리자 계정 채우기' : '관리자 비밀번호 채우기' }}
        </button>
      </div>
    </main>
  </div>
</template>

<style scoped>
.al {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  background: #eeeff4;
}
.al__band {
  padding: 8px var(--gutter);
  background: var(--c-moon);
  color: var(--c-moon-ink);
  font-size: 13px;
  font-weight: 500;
  text-align: center;
}
.al__main {
  flex: 1;
  display: grid;
  place-items: center;
  padding: 32px var(--gutter);
}
.card {
  width: min(100%, 420px);
  padding: 30px 28px 24px;
  border-radius: var(--r-lg);
  background: var(--c-surface);
  border: 1px solid var(--c-line);
  box-shadow: var(--shadow-1);
}
.card__brand {
  display: flex;
  align-items: center;
  gap: 10px;
}
.card__tag {
  padding: 1px 7px;
  border-radius: 4px;
  background: var(--c-ink);
  color: var(--c-moon);
  font-size: 11px;
}
.card__form {
  display: flex;
  flex-direction: column;
}
.card__title {
  margin-top: 22px;
  font-size: 24px;
  color: var(--c-ink);
}
.card__sub {
  margin: 8px 0 18px;
  color: var(--c-mute);
  font-size: 14px;
}
.field {
  margin: 12px 0 6px;
  font-size: 13px;
  font-weight: 600;
  color: var(--c-ink-2);
}
.card__error {
  margin-top: 12px;
  color: var(--c-crimson-deep);
  font-size: 13.5px;
}
.card__submit {
  margin-top: 20px;
  height: 46px;
}
.card__link {
  align-self: center;
  margin-top: 14px;
  padding: 0;
  border: 0;
  background: none;
  color: var(--c-mute);
  font: inherit;
  font-size: 13px;
  text-decoration: underline;
  cursor: pointer;
}
.card__dev {
  display: block;
  margin: 18px auto 0;
  padding: 4px 10px;
  border: 1px dashed var(--c-line-strong);
  border-radius: 999px;
  background: none;
  color: var(--c-mute);
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}
</style>
