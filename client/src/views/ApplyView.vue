<script setup>
import { ref, reactive, computed, onMounted } from 'vue';
import { useRouter, onBeforeRouteLeave } from 'vue-router';
import { DxButton } from 'devextreme-vue/button';
import { DxLoadPanel } from 'devextreme-vue/load-panel';
import notify from 'devextreme/ui/notify';
import { confirm } from 'devextreme/ui/dialog';
import { api } from '@/api';
import { session, flash } from '@/stores/session';
import { emptyForm, toFormModel, fromFormModel, sectionProgress } from '@/utils/applicationModel';
import ApplicantForm from '@/components/ApplicantForm.vue';

const router = useRouter();
const formComp = ref();
const form = ref(null);
const editing = ref(false);
const saving = ref(false);
const dirty = ref(false);
const tick = ref(0); // 폼 값이 바뀔 때마다 진행률을 다시 계산하기 위한 신호

onMounted(async () => {
  try {
    const mine = await api.application.getMine();
    editing.value = Boolean(mine);
    form.value = reactive(mine ? toFormModel(mine) : emptyForm(session.user));
  } catch (e) {
    notify({ message: e.message, type: 'error', displayTime: 3500 });
    form.value = reactive(emptyForm(session.user));
  }
});

const sections = computed(() => {
  tick.value; // eslint-disable-line no-unused-expressions
  return form.value ? sectionProgress(form.value) : [];
});
const doneCount = computed(() => sections.value.reduce((s, x) => s + x.done, 0));
const totalCount = computed(() => sections.value.reduce((s, x) => s + x.total, 0));
const pct = computed(() => (totalCount.value ? Math.round((doneCount.value / totalCount.value) * 100) : 0));

function onChange() {
  tick.value++;
  dirty.value = true;
}

function scrollToSection(key) {
  document.querySelector(`.sec-${key}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function submit() {
  const result = formComp.value.validate();
  if (!result.isValid) {
    const fields = new Set(result.brokenRules.map((r) => r.validator)).size;
    notify({ message: `확인이 필요한 항목이 ${fields}개 있어요. 빨간 표시를 확인해 주세요.`, type: 'warning', displayTime: 3000 });
    const first = result.brokenRules[0]?.validator;
    first?.$element()[0]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setTimeout(() => first?.focus(), 350);
    return;
  }

  saving.value = true;
  try {
    const payload = fromFormModel(form.value);
    if (editing.value) await api.application.update(payload);
    else await api.application.create(payload);
    flash.applied = editing.value ? 'updated' : 'created';
    dirty.value = false;
    router.push({ name: 'home' });
  } catch (e) {
    notify({ message: e.message, type: 'error', displayTime: 4000 });
  } finally {
    saving.value = false;
  }
}

onBeforeRouteLeave(async () => {
  if (!dirty.value) return true;
  return confirm('작성 중인 내용은 저장되지 않아요. 이 화면을 나갈까요?', '작성 중이에요');
});
</script>

<template>
  <div class="apply">
    <div class="container">
      <header class="head">
        <RouterLink to="/" class="head__back">← 홈으로</RouterLink>
        <p class="head__eyebrow"><span class="head__stamp">親展</span> 사緣 신청서</p>
        <h1 class="head__title display">{{ editing ? '신청서 수정' : '나를 소개하는 시간' }}</h1>
        <p class="head__lead">
          편하게, 솔직하게 적어주세요. 작성한 내용은 매칭 담당자만 볼 수 있고,
          두 분이 서로 수락하기 전까지 상대에게 공개되지 않아요.
        </p>
      </header>

      <div class="layout">
        <section class="sheet" aria-label="신청서">
          <p class="verified">
            <i class="dx-icon-check" aria-hidden="true" />
            임직원 인증 완료 · 사번 <span class="mono">{{ session.user.empNo }}</span>
          </p>

          <ApplicantForm v-if="form" ref="formComp" :form-data="form" @change="onChange" />
          <div v-else class="sheet__loading" />

          <div class="actions">
            <DxButton
              class="actions__submit"
              :text="editing ? '수정 내용 저장' : '신청하기'"
              type="default"
              :disabled="saving || !form"
              @click="submit"
            />
            <DxButton text="취소" styling-mode="outlined" @click="router.push({ name: 'home' })" />
          </div>
        </section>

        <aside class="progress" aria-label="작성 진행률">
          <div class="progress__card">
            <p class="progress__label">
              필수 항목 <b>{{ doneCount }}</b> / {{ totalCount }}
            </p>
            <div
              class="progress__bar"
              role="progressbar"
              :aria-valuenow="pct"
              aria-valuemin="0"
              aria-valuemax="100"
            >
              <span :style="{ width: `${pct}%` }" />
            </div>
            <ul class="progress__list">
              <li v-for="s in sections" :key="s.key" :class="{ 'is-done': s.done === s.total }">
                <button type="button" @click="scrollToSection(s.key)">
                  <span class="progress__check" aria-hidden="true" />
                  {{ s.title }}
                </button>
                <span class="mono">{{ s.done }}/{{ s.total }}</span>
              </li>
            </ul>
            <p class="progress__lock">
              <i class="dx-icon-lock" aria-hidden="true" />
              입력한 내용은 암호화되어 전송·보관돼요.
            </p>
          </div>
        </aside>
      </div>
    </div>

    <DxLoadPanel :visible="saving" message="안전하게 보내는 중이에요" :shading="true" shading-color="rgba(34,36,74,0.25)" />
  </div>
</template>

<style scoped>
.apply {
  padding: clamp(24px, 4vw, 48px) 0 72px;
}

.head {
  max-width: 760px;
}
.head__back {
  color: var(--c-mute);
  font-size: 14px;
  text-decoration: none;
}
.head__back:hover {
  color: var(--c-crimson-deep);
}
.head__eyebrow {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 22px;
  color: var(--c-mute);
  font-size: 14px;
}
.head__stamp {
  padding: 2px 6px;
  border: 1.5px solid var(--c-crimson);
  border-radius: 4px;
  color: var(--c-crimson);
  font-family: var(--f-display);
  font-size: 12px;
  font-weight: 700;
  transform: rotate(-3deg);
}
.head__title {
  margin-top: 10px;
  font-size: clamp(28px, 3.4vw, 40px);
  color: var(--c-indigo);
}
.head__lead {
  margin-top: 10px;
  color: var(--c-ink-2);
}

.layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 260px;
  gap: 28px;
  align-items: start;
  margin-top: 28px;
}

.sheet {
  padding: clamp(18px, 3vw, 36px);
  background: var(--c-surface);
  border: 1px solid var(--c-line);
  border-radius: var(--r-lg);
  box-shadow: var(--shadow-1);
}
.sheet__loading {
  height: 480px;
}
.verified {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 20px;
  padding: 4px 12px;
  border-radius: 999px;
  background: var(--c-ok-bg);
  color: var(--c-ok);
  font-size: 13px;
  font-weight: 500;
}
.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 32px;
  padding-top: 24px;
  border-top: 1px solid var(--c-line);
}
.actions__submit {
  min-width: 200px;
  height: 50px;
}
.actions__submit :deep(.dx-button-text) {
  font-size: 16px;
  font-weight: 600;
}
.actions :deep(.dx-button) {
  height: 50px;
}

.progress {
  position: sticky;
  top: calc(var(--header-h) + 20px);
}
.progress__card {
  padding: 20px;
  background: var(--c-surface);
  border: 1px solid var(--c-line);
  border-radius: var(--r-lg);
}
.progress__label {
  font-size: 14px;
  color: var(--c-ink-2);
}
.progress__label b {
  color: var(--c-crimson-deep);
  font-size: 18px;
}
.progress__bar {
  height: 6px;
  margin: 10px 0 16px;
  border-radius: 999px;
  background: var(--c-blush);
  overflow: hidden;
}
.progress__bar span {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: var(--c-crimson);
  transition: width 0.35s ease;
}
.progress__list {
  list-style: none;
  margin: 0;
  padding: 0;
}
.progress__list li {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 0;
  font-size: 14px;
}
.progress__list button {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 0;
  border: 0;
  background: none;
  color: var(--c-ink-2);
  font: inherit;
  cursor: pointer;
}
.progress__list button:hover {
  color: var(--c-crimson-deep);
}
.progress__list .mono {
  color: var(--c-mute);
  font-size: 12.5px;
}
.progress__check {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  border: 1.5px solid var(--c-line-strong);
}
.is-done .progress__check {
  border-color: var(--c-crimson);
  background: var(--c-crimson)
    url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Cpath d='M4 8.5l2.5 2.5L12 5.5' fill='none' stroke='white' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E")
    center / 12px no-repeat;
}
.progress__lock {
  display: flex;
  gap: 6px;
  margin-top: 16px;
  padding-top: 14px;
  border-top: 1px solid var(--c-line);
  color: var(--c-mute);
  font-size: 12.5px;
}

@media (max-width: 991px) {
  .layout {
    grid-template-columns: 1fr;
  }
  /* 좁은 화면: 진행률을 헤더 아래 얇은 띠로 */
  .progress {
    order: -1;
    top: var(--header-h);
    z-index: 10;
    margin: 0 calc(var(--gutter) * -1);
  }
  .progress__card {
    padding: 10px var(--gutter);
    border-radius: 0;
    border-width: 0 0 1px;
    background: rgba(255, 255, 255, 0.94);
    backdrop-filter: blur(8px);
  }
  .progress__bar {
    margin: 6px 0 0;
  }
  .progress__list,
  .progress__lock {
    display: none;
  }
}
</style>
