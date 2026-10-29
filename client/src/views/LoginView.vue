<script setup>
/**
 * 개발 화면 계정 바꾸기 — 처음에는 첫 계정으로 바로 들어가고, 로그아웃하면 이 화면에서 다른 테스트 계정을 골라 들어간다.
 *  npm run dev:mock : 가짜 데이터의 테스트 계정 (계정마다 상태가 달라 화면별로 나눠 시험)
 *  npm run dev      : 운영 API 서버의 테스트 사번 (servers.config.mjs 의 devLogin — 운영 데이터가 보인다)
 * 운영 모드는 이 화면 대신 SsoGateView (사내 인사정보로 확인된 임직원만).
 */
import { ref, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { DxTextBox } from 'devextreme-vue/text-box';
import { DxButton } from 'devextreme-vue/button';
import { login, devLoginAs } from '@/stores/session';
import { api } from '@/api';
import { ADMIN_PATH, isDevApi } from '@/config';
import SaLogo from '@/components/SaLogo.vue';
import BadgeScene from '@/components/BadgeScene.vue';

const route = useRoute();
const router = useRouter();
const accounts = ref([]); // [{ key, title, desc, account }]
const seed = ref(null);
const account = ref('');
const error = ref('');
const busy = ref('');

/* global __SAYEON_MOCK__ */
/** 가짜 데이터 테스트 계정 — 빌드(npm run build)·개발 모드(npm run dev)에서는 import 자체가 사라진다 */
const loadSeed = () => (__SAYEON_MOCK__ ? import('@/api/mock/accounts.js') : Promise.resolve(null));
const GENDER = { M: '남', F: '여' };

onMounted(async () => {
  if (isDevApi) {
    try {
      const list = await api.auth.devAccounts();
      accounts.value = list.map((a, i) => ({
        key: a.empNo, account: a.empNo, title: a.name || a.empNo, pick: i === 0,
        desc: [GENDER[a.gender], a.division, a.team].filter(Boolean).join(' · '),
      }));
    } catch (e) {
      error.value = e.status === 404
        ? '이 PC 에서는 테스트 사번 로그인이 허용되지 않았어요 — 개발 PC IP · client/.env.development.local 의 SAYEON_DEV_KEY · API 서버 .env 의 DEV_LOGIN_KEY 를 확인해 주세요.'
        : e.message;
    }
    return;
  }
  seed.value = await loadSeed();
  if (!seed.value) return;
  accounts.value = seed.value.TEST_ACCOUNT_LIST.map((a) => ({ ...a, account: seed.value.TEST_ACCOUNTS[a.key] }));
});

async function enter(id) {
  if ((!seed.value && !isDevApi) || !id) return;
  busy.value = id;
  error.value = '';
  try {
    if (isDevApi) await devLoginAs(id.trim());
    else await login(id.trim(), seed.value.MOCK_PASSWORD);
    const redirect = typeof route.query.redirect === 'string' && route.query.redirect.startsWith('/') ? route.query.redirect : '/';
    router.replace(redirect);
  } catch (e) {
    error.value = `${id} — ${e.message}`;
  } finally {
    busy.value = '';
  }
}
</script>

<template>
  <div class="login">
    <section class="story">
      <SaLogo :height="40" tone="light" />
      <h1 class="story__title display">같은 캠퍼스 어딘가에<br />당신의 인연이 출근하고 있어요</h1>
      <p class="story__lead">
        사緣은 DS부문 임직원을 위한 비공개 소개팅이에요.
        緣은 '인연 연'. 회사에서 시작되는 인연을 조심스럽게 이어드려요.
      </p>
      <BadgeScene class="story__art" />
    </section>

    <section class="panel">
      <div class="card">
        <p class="card__eyebrow">{{ isDevApi ? '개발 모드 · 운영 API 서버 (운영 데이터)' : '개발 모드 · 가짜 데이터' }}</p>
        <h2 class="card__title">테스트 {{ isDevApi ? '사번' : '계정' }}으로 들어가기</h2>
        <p v-if="isDevApi" class="card__sub">운영 DB 를 함께 써요. 테스트 사번으로 만든 신청·하트·쪽지는 '테스트'로 표시되고 일반 사용자에게는 보이지 않아요. (운영 모드에서는 이 화면 없이 사내 인사정보로 확인해 들어와요)</p>
        <p v-else class="card__sub">계정마다 신청 상태가 달라요. 시험할 화면에 맞는 계정을 고르면 바로 들어가요. (운영 모드에서는 이 화면 없이 사내 인사정보로 확인해 들어와요)</p>

        <ul class="accts">
          <li v-for="a in accounts" :key="a.key">
            <button type="button" class="acct" :class="{ 'is-pick': a.pick }" :disabled="!!busy" @click="enter(a.account)">
              <span class="acct__head">
                <b>{{ a.title }}</b>
                <span class="acct__id mono">{{ a.account }}</span>
              </span>
              <span class="acct__desc">{{ a.desc }}</span>
              <span class="acct__go">{{ busy === a.account ? '들어가는 중…' : '들어가기 →' }}</span>
            </button>
          </li>
        </ul>

        <p v-if="error" class="card__error" role="alert">{{ error }}</p>

        <form v-if="!isDevApi" class="direct" novalidate @submit.prevent="enter(account)">
          <label class="field__label" for="login-account">다른 계정 직접 입력 (사내 계정 ID 또는 사번)</label>
          <div class="direct__row">
            <DxTextBox
              v-model:value="account"
              placeholder="예: gildong.hong"
              :max-length="40"
              :input-attr="{ id: 'login-account', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false' }"
              class="direct__input"
            />
            <DxButton text="들어가기" type="default" :use-submit-behavior="true" :disabled="!!busy || !account.trim()" />
          </div>
        </form>

        <p v-if="isDevApi" class="card__privacy">
          관리자 화면은 <span class="mono">{{ ADMIN_PATH }}</span> — 테스트 사번을 API 서버 config/admins.js 에 넣은 경우에만 들어가요.
        </p>
        <p v-else class="card__privacy">
          관리자 화면은 <span class="mono">{{ ADMIN_PATH }}</span> 주소에서 만능 계정·매칭 담당자로 들어가요.
          입력한 내용은 이 브라우저에만 저장돼요 — 실제 개인정보는 넣지 마세요.
        </p>
      </div>
    </section>
  </div>
</template>

<style scoped>
.login {
  min-height: 100vh;
  display: grid;
  grid-template-columns: minmax(0, 1.15fr) minmax(360px, 0.85fr);
  background:
    radial-gradient(55% 60% at 30% 75%, rgba(64, 98, 235, 0.5) 0%, transparent 70%),
    var(--c-indigo);
}

.story {
  display: flex;
  flex-direction: column;
  gap: 22px;
  padding: clamp(28px, 6vw, 72px) clamp(20px, 6vw, 80px);
  color: var(--c-on-indigo);
}
.story__title {
  font-family: var(--f-body);
  font-weight: 700;
  letter-spacing: -0.03em;
  font-size: clamp(30px, 3.6vw, 46px);
  line-height: 1.26;
  margin-top: clamp(24px, 6vh, 64px);
  color: #fff;
}
.story__lead {
  max-width: 34em;
  color: var(--c-on-indigo-mute);
  font-size: 16px;
}
.story__art {
  max-width: 420px;
  margin-top: auto;
  align-self: center;
}

.panel {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 32px var(--gutter);
  background: var(--c-paper);
  border-top-left-radius: 28px;
  border-bottom-left-radius: 28px;
}
.card {
  width: 100%;
  max-width: 400px;
  display: flex;
  flex-direction: column;
}
.card__eyebrow {
  align-self: flex-start;
  padding: 2px 10px;
  border-radius: 999px;
  background: var(--c-blush);
  color: var(--c-crimson-deep);
  font-size: 12.5px;
  font-weight: 600;
}
.card__title {
  margin-top: 14px;
  font-family: var(--f-display);
  font-size: 30px;
}
.card__sub {
  margin: 6px 0 18px;
  color: var(--c-mute);
}
.field__label {
  margin: 14px 0 6px;
  font-size: 13px;
  font-weight: 600;
  color: var(--c-ink-2);
}
.card__error {
  margin-top: 12px;
  color: var(--c-crimson-deep);
  font-size: 14px;
}
.card__privacy {
  margin-top: 14px;
  color: var(--c-mute);
  font-size: 13px;
}

.accts {
  display: grid;
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
}
.acct {
  width: 100%;
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 2px 12px;
  padding: 12px 14px;
  border: 1px solid var(--c-line);
  border-radius: var(--r-md);
  background: var(--c-surface);
  color: var(--c-ink);
  font: inherit;
  text-align: left;
  cursor: pointer;
  transition: border-color 0.15s, box-shadow 0.15s;
}
.acct:hover:not(:disabled) {
  border-color: var(--c-crimson);
  box-shadow: 0 2px 10px rgba(194, 39, 76, 0.1);
}
.acct:disabled {
  cursor: default;
  opacity: 0.7;
}
.acct.is-pick {
  border-color: var(--c-crimson);
}
.acct__head {
  display: flex;
  align-items: baseline;
  gap: 8px;
  flex-wrap: wrap;
}
.acct__id {
  color: var(--c-mute);
  font-size: 12px;
}
.acct__desc {
  grid-column: 1;
  color: var(--c-ink-2);
  font-size: 13px;
}
.acct__go {
  grid-column: 2;
  grid-row: 1 / span 2;
  align-self: center;
  color: var(--c-crimson-deep);
  font-size: 13px;
  font-weight: 600;
  white-space: nowrap;
}
.direct {
  display: flex;
  flex-direction: column;
  margin-top: 18px;
}
.direct__row {
  display: flex;
  gap: 8px;
}
.direct__input {
  flex: 1;
}

@media (max-width: 900px) {
  .login {
    grid-template-columns: 1fr;
  }
  .story__title {
    margin-top: 8px;
  }
  .story__art {
    max-width: 420px;
    margin: 0 auto;
  }
  .panel {
    border-radius: 28px 28px 0 0;
    padding-top: 36px;
    padding-bottom: 48px;
  }
}
</style>
