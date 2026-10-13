<script setup>
import { ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { DxTextBox, DxButton as DxTextBoxButton } from 'devextreme-vue/text-box';
import { DxButton } from 'devextreme-vue/button';
import { DxValidator, DxRequiredRule, DxPatternRule } from 'devextreme-vue/validator';
import { login } from '@/stores/session';
import SaLogo from '@/components/SaLogo.vue';
import BadgeScene from '@/components/BadgeScene.vue';

import { isTestMode } from '@/config';

const DEV_MOCK = isTestMode;

const route = useRoute();
const router = useRouter();
const account = ref('');
const password = ref('');
const pwMode = ref('password');
const error = ref('');
const busy = ref(false);

const pwToggle = {
  icon: 'eyeopen',
  stylingMode: 'text',
  hint: '비밀번호 보기',
  onClick: (e) => {
    pwMode.value = pwMode.value === 'password' ? 'text' : 'password';
    e.component.option('icon', pwMode.value === 'password' ? 'eyeopen' : 'eyeclose');
  },
};

async function submit() {
  busy.value = true;
  error.value = '';
  try {
    await login(account.value.trim(), password.value);
    const redirect = typeof route.query.redirect === 'string' && route.query.redirect.startsWith('/') ? route.query.redirect : '/';
    router.replace(redirect);
  } catch (e) {
    error.value = e.message;
    password.value = '';
  } finally {
    busy.value = false;
  }
}

/** 테스트 계정 정보 — VITE_INCLUDE_MOCK=false 빌드에서는 import 자체가 사라진다 */
const loadSeed = () => (import.meta.env.VITE_INCLUDE_MOCK !== 'false' ? import('@/api/mock/accounts.js') : Promise.resolve(null));

async function fillTestAccount(kind) {
  const seed = DEV_MOCK ? await loadSeed() : null;
  if (!seed) return;
  account.value = seed.TEST_ACCOUNTS[kind];
  password.value = seed.MOCK_PASSWORD;
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
      <form class="card" novalidate @submit.prevent="submit">
        <p class="card__eyebrow">임직원 전용</p>
        <h2 class="card__title">사내 계정 로그인</h2>
        <p class="card__sub">PC 로그인에 쓰는 사내 계정(AD)으로 재직 중인 임직원인지 확인해요.</p>

        <label class="field__label" for="login-account">사내 계정 ID 또는 사번</label>
        <DxTextBox
          v-model:value="account"
          placeholder="예: gildong.hong 또는 20230001"
          :max-length="40"
          :input-attr="{ id: 'login-account', autocomplete: 'username', autocapitalize: 'off', spellcheck: 'false' }"
        >
          <DxValidator validation-group="login">
            <DxRequiredRule message="사내 계정 ID 또는 사번을 입력해 주세요." />
            <DxPatternRule :pattern="/^[A-Za-z0-9._-]{3,40}$/" message="영문·숫자·점(.)으로 된 사내 계정 ID나 사번을 입력해 주세요." />
          </DxValidator>
        </DxTextBox>

        <label class="field__label" for="login-pw">비밀번호</label>
        <DxTextBox
          v-model:value="password"
          :mode="pwMode"
          placeholder="사내 계정 비밀번호"
          :input-attr="{ id: 'login-pw', autocomplete: 'current-password' }"
        >
          <DxTextBoxButton name="toggle" location="after" :options="pwToggle" />
          <DxValidator validation-group="login">
            <DxRequiredRule message="비밀번호를 입력해 주세요." />
          </DxValidator>
        </DxTextBox>

        <p v-if="error" class="card__error" role="alert">{{ error }}</p>

        <DxButton
          class="card__submit"
          text="사내 계정으로 로그인"
          type="default"
          width="100%"
          :use-submit-behavior="true"
          validation-group="login"
          :disabled="busy"
        />

        <p class="card__privacy">
          비밀번호는 재직 확인에만 쓰고 저장하지 않아요. 사緣에 들어왔다는 사실도 다른 임직원에게 알려지지 않아요.
        </p>

        <div v-if="DEV_MOCK" class="dev">
          <p class="dev__title">테스트 운영 중 · 가짜 데이터로 동작해요 (실제 정보를 넣지 마세요)</p>
          <div class="dev__btns">
            <button type="button" class="dev__master" @click="fillTestAccount('MASTER')">만능 테스트 계정 (신청·하트)</button>
            <button type="button" @click="fillTestAccount('NEW')">신청 전 계정 채우기</button>
            <button type="button" @click="fillTestAccount('APPLIED')">신청 완료 계정 채우기</button>
            <button type="button" @click="fillTestAccount('RETIRED')">퇴직자 계정 채우기</button>
          </div>
        </div>
      </form>
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
  margin: 6px 0 22px;
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
.card__submit {
  margin-top: 24px;
  height: 48px;
}
.card__submit :deep(.dx-button-text) {
  font-size: 15px;
  font-weight: 600;
}
.card__privacy {
  margin-top: 14px;
  color: var(--c-mute);
  font-size: 13px;
}

.dev {
  margin-top: 28px;
  padding: 12px 14px;
  border: 1px dashed var(--c-line-strong);
  border-radius: var(--r-md);
}
.dev__title {
  font-size: 12px;
  color: var(--c-mute);
}
.dev__btns {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 8px;
}
.dev__btns .dev__master {
  border-color: var(--c-crimson);
  color: var(--c-crimson-deep);
  font-weight: 600;
}
.dev__btns button {
  padding: 4px 10px;
  border: 1px solid var(--c-line-strong);
  border-radius: 999px;
  background: var(--c-surface);
  color: var(--c-ink-2);
  font: inherit;
  font-size: 12.5px;
  cursor: pointer;
}
.dev__btns button:hover {
  border-color: var(--c-crimson);
  color: var(--c-crimson-deep);
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
