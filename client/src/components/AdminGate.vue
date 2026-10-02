<script setup>
/**
 * 관리자 모드 진입 — 별도 관리자 비밀번호를 확인한 뒤 관리 화면으로 전환한다.
 * 비밀번호 검증·실패 횟수 제한·잠금은 서버가 담당하고, 이 화면은 결과만 보여준다.
 */
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { DxPopup } from 'devextreme-vue/popup';
import { DxTextBox } from 'devextreme-vue/text-box';
import { DxButton } from 'devextreme-vue/button';
import { enterAdmin } from '@/stores/session';
import SaLogo from './SaLogo.vue';

const DEV_MOCK = import.meta.env.VITE_API_MODE === 'mock';

const visible = defineModel('visible', { type: Boolean, default: false });
const router = useRouter();
const boxRef = ref();
const password = ref('');
const error = ref('');
const busy = ref(false);

async function submit() {
  if (!password.value) {
    error.value = '관리자 비밀번호를 입력해 주세요.';
    return;
  }
  busy.value = true;
  error.value = '';
  try {
    await enterAdmin(password.value);
    visible.value = false;
    router.push({ name: 'admin-dashboard' });
  } catch (e) {
    error.value = e.message;
  } finally {
    busy.value = false;
    password.value = '';
  }
}

async function fillTestPassword() {
  if (!DEV_MOCK) return;
  const { MOCK_ADMIN_PASSWORD } = await import('@/api/mock/seed.js');
  password.value = MOCK_ADMIN_PASSWORD;
}

function onHidden() {
  password.value = '';
  error.value = '';
}
</script>

<template>
  <DxPopup
    v-model:visible="visible"
    :width="420"
    max-width="calc(100vw - 32px)"
    height="auto"
    :show-title="false"
    :hide-on-outside-click="true"
    :drag-enabled="false"
    :wrapper-attr="{ class: 'sa-popup' }"
    @shown="boxRef?.instance.focus()"
    @hidden="onHidden"
  >
    <form class="gate" @submit.prevent="submit">
      <SaLogo mark :height="44" />
      <h2 class="gate__title">관리자 모드</h2>
      <p class="gate__desc">
        매칭 담당자 전용이에요. 관리자 비밀번호를 입력하면 신청자 관리 화면으로 바뀌어요.
        들어가고 나가는 기록은 모두 남아요.
      </p>

      <label class="gate__label" for="admin-password">관리자 비밀번호</label>
      <DxTextBox
        ref="boxRef"
        v-model:value="password"
        mode="password"
        :input-attr="{ id: 'admin-password', autocomplete: 'off' }"
        :is-valid="!error"
        value-change-event="input"
        @enter-key="submit"
      />
      <p v-if="error" class="gate__error" role="alert">{{ error }}</p>

      <DxButton
        class="gate__submit"
        text="관리자 모드로 전환"
        type="default"
        :disabled="busy"
        width="100%"
        @click="submit"
      />
      <button v-if="DEV_MOCK" type="button" class="gate__dev" @click="fillTestPassword">
        개발 모드 · 테스트 비밀번호 채우기
      </button>
    </form>
  </DxPopup>
</template>

<style scoped>
.gate {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 10px;
  padding: 8px 4px 4px;
}
.gate__title {
  margin-top: 6px;
  font-family: var(--f-display);
  font-size: 24px;
}
.gate__desc {
  color: var(--c-mute);
  font-size: 14px;
  margin-bottom: 8px;
}
.gate__label {
  font-size: 13px;
  font-weight: 600;
  color: var(--c-ink-2);
}
.gate :deep(.dx-textbox) {
  width: 100%;
}
.gate__error {
  color: var(--c-crimson-deep);
  font-size: 13px;
}
.gate__submit {
  margin-top: 8px;
  height: 44px;
}
.gate__dev {
  align-self: center;
  margin-top: 2px;
  padding: 4px 8px;
  border: 0;
  background: none;
  color: var(--c-mute);
  font: inherit;
  font-size: 12px;
  text-decoration: underline dotted;
  cursor: pointer;
}
</style>
