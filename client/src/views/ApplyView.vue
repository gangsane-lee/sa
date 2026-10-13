<script setup>
import { ref, reactive, computed, onMounted, onBeforeUnmount } from 'vue';
import { useRoute, useRouter, onBeforeRouteLeave } from 'vue-router';
import { DxButton } from 'devextreme-vue/button';
import { DxLoadPanel } from 'devextreme-vue/load-panel';
import { DxPopup } from 'devextreme-vue/popup';
import notify from 'devextreme/ui/notify';
import { confirm } from 'devextreme/ui/dialog';
import { api } from '@/api';
import { session, flash, refreshUser } from '@/stores/session';
import {
  emptyForm, toFormModel, fromFormModel, sectionProgress, matchReadiness, OPTIONAL_BOOSTERS,
} from '@/utils/applicationModel';
import ApplicantForm from '@/components/ApplicantForm.vue';

const router = useRouter();
const route = useRoute();
/** 사주 하트 팝업에서 '정식으로 신청하기'로 왔는가 — 팝업에 적은 값을 이어 받는다 */
const fromSaju = route.query.from === 'saju';
const DRAFT_KEY = 'sayeon.quickDraft';
function takeDraft() {
  try {
    const d = JSON.parse(sessionStorage.getItem(DRAFT_KEY) ?? 'null');
    sessionStorage.removeItem(DRAFT_KEY);
    return d && typeof d === 'object' ? d : null;
  } catch {
    return null;
  }
}
const formComp = ref();
const form = ref(null);
const editing = ref(false);
const saving = ref(false);
const dirty = ref(false);
const tick = ref(0); // 폼 값이 바뀔 때마다 진행률을 다시 계산하기 위한 신호
const locked = ref(false);
const quick = ref(false);
const lockReason = ref(null);
const blocked = ref(false);
const LOCK = {
  MATCHING: { title: '매칭 중에는 신청서를 고칠 수 없어요', text: "지금 만나고 있는 인연에 집중할 수 있도록 잠가 두었어요. 매칭이 끝나 '매칭 대기 중'이 되면 다시 고칠 수 있어요. 아래는 읽기만 할 수 있어요." },
  HEART: { title: '하트에 답을 기다리는 중이에요', text: '하트를 보낸 뒤에는 상대가 답하거나 72시간이 지날 때까지 신청서를 고칠 수 없어요. 상대가 본 내 모습이 그대로 유지되도록 잠가 두었어요.' },
  COUPLED: { title: '커플 완료 상태예요', text: "두 분의 매칭을 최종 완료해서 신청서를 잠가 두었어요. 홈에서 '다시 인연 찾기'를 누르면 두 분 모두 커플 상태가 끝나고 다시 고칠 수 있어요." },
};
const nudge = ref(null); // { text, pct } — 선택 항목을 채웠을 때 잠깐 뜨는 칭찬·유도 문구
const boostPopup = ref(false);
let boostAsked = false;
let nudged = new Set();
let nudgeTimer;
let originalGender = null;

onMounted(async () => {
  try {
    const mine = await api.application.getMine();
    editing.value = Boolean(mine);
    // 매칭 중에는 '매칭 대기 중'으로 돌아갈 때까지 수정할 수 없다 (서버도 409로 막는다)
    locked.value = Boolean(mine?.editLocked);
    lockReason.value = mine?.lockReason ?? (mine?.editLocked ? 'MATCHING' : null);
    blocked.value = !mine && Boolean(session.user?.blocked);
    quick.value = Boolean(mine?.quick);
    const base = emptyForm(session.user);
    const draft = !mine && fromSaju ? takeDraft() : null;
    // 사주 팝업에서 적은 값 중 신청서에 있는 항목만 옮긴다 (이름·소속은 인사정보 그대로)
    if (draft) for (const k of Object.keys(base)) if (k in draft && !['name', 'division', 'team'].includes(k)) base[k] = draft[k];
    form.value = reactive(mine ? toFormModel(mine) : base);
    originalGender = mine?.gender ?? null;
    nudged = new Set(matchReadiness(form.value).filledKeys); // 이미 채운 항목은 다시 칭찬하지 않는다
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

const readiness = computed(() => {
  tick.value; // eslint-disable-line no-unused-expressions
  return form.value ? matchReadiness(form.value) : { pct: 50, missing: OPTIONAL_BOOSTERS, filledKeys: new Set() };
});

function onChange() {
  tick.value++;
  dirty.value = true;
  const r = matchReadiness(form.value);
  const fresh = [...r.filledKeys].find((k) => !nudged.has(k));
  if (fresh) {
    nudged.add(fresh);
    nudge.value = { text: OPTIONAL_TEXT[fresh] ?? '', pct: r.pct };
    clearTimeout(nudgeTimer);
    nudgeTimer = setTimeout(() => (nudge.value = null), 3600);
  }
}
const OPTIONAL_TEXT = Object.fromEntries(OPTIONAL_BOOSTERS.map((b) => [b.key, b.nudge]));

/** 선택 항목으로 이동 (팝업의 '채우러 갈게요') */
function goFillOptional() {
  boostPopup.value = false;
  const first = readiness.value.missing[0];
  const sec = first?.key.startsWith('pref') ? 'pref' : 'basic';
  scrollToSection(sec);
}

function scrollToSection(key) {
  document.querySelector(`.sec-${key}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function submit() {
  const result = formComp.value.validate();
  if (!result.isValid) {
    notify({ message: `확인이 필요한 항목이 ${result.count}개 있어요. 빨간 표시를 확인해 주세요.`, type: 'warning', displayTime: 3000 });
    result.focus();
    return;
  }
  // 선택 항목이 많이 비어 있으면 한 번만 부드럽게 권한다 (강요하지 않음)
  if (!boostAsked && readiness.value.pct < 75) {
    boostAsked = true;
    boostPopup.value = true;
    return;
  }
  await save();
}

async function save() {
  boostPopup.value = false;
  // 성별을 바꾸면 하트·오늘의 후보가 모두 초기화된다 — 한 번 더 확인
  if (editing.value && originalGender && form.value.gender !== originalGender) {
    const ok = await confirm(
      '성별을 바꾸면 <b>보낸 하트·받은 하트·오늘의 후보가 모두 초기화</b>되고 새 기준으로 다시 추천돼요.<br>되돌릴 수 없어요. 저장할까요?',
      '성별 변경',
    );
    if (!ok) return;
  }
  saving.value = true;
  try {
    const payload = fromFormModel(form.value);
    if (editing.value) {
      await api.application.update(payload);
      flash.applied = 'updated';
    } else {
      await api.application.create(payload);
    }
    dirty.value = false;
    await refreshUser(); // 신청 상태(GUEST→APPLICANT 등)를 헤더·라우팅에 반영
    if (editing.value) notify({ message: '신청서를 저장했어요. 바뀐 선호는 다음 후보부터 반영돼요.', type: 'success', displayTime: 3000 });
    router.push(editing.value ? { name: 'home' } : { name: 'apply-done', query: fromSaju ? { from: 'saju' } : {} });
  } catch (e) {
    notify({ message: e.message, type: 'error', displayTime: 4000 });
  } finally {
    saving.value = false;
  }
}

onBeforeUnmount(() => clearTimeout(nudgeTimer));

async function withdraw() {
  const ok = await confirm(
    '신청을 철회하면 작성한 정보와 하트·쪽지 내역이 <b>즉시 모두 삭제</b>되고 되돌릴 수 없어요.<br>진행 중인 매칭이 있다면 함께 취소돼요. 철회할까요?',
    '신청 철회',
  );
  if (!ok) return;
  try {
    await api.application.withdraw();
    dirty.value = false;
    await refreshUser();
    notify({ message: '신청을 철회했어요. 작성한 정보는 모두 삭제했어요.', type: 'success', displayTime: 3000 });
    router.replace({ name: 'home' });
  } catch (e) {
    notify({ message: e.message, type: 'error', displayTime: 3500 });
  }
}

onBeforeRouteLeave(async () => {
  if (!dirty.value || locked.value) return true;
  return confirm('작성 중인 내용은 저장되지 않아요. 이 화면을 나갈까요?', '작성 중이에요');
});
</script>

<template>
  <div class="apply tone-warm">
    <div class="container">
      <header class="head">
        <RouterLink to="/" class="head__back">← 홈으로</RouterLink>
        <p class="head__eyebrow"><span class="head__stamp">親展</span> {{ editing ? '마이페이지 · 내 신청서' : '사緣 신청서' }}</p>
        <h1 class="head__title display">{{ editing ? (quick ? '신청서를 마저 채워주세요' : '내 신청서') : '나를 소개하는 시간' }}</h1>
        <p v-if="fromSaju && !editing" class="head__quick">
          인연 사주에서 적은 내용을 그대로 옮겨 왔어요. 나머지를 채워 신청하면 <b>매일 3명의 후보</b>가 도착하고,
          <b>사주 인연에게도 하트</b>를 보낼 수 있어요.
        </p>
        <p v-if="quick" class="head__quick">
          사주로 하트를 보낸 임시 신청 상태예요. 나머지를 채우면 <b>매일 3명의 후보</b>가 열리고, 선호까지 반영해 <b>다음 매칭부터 더 잘 맞는 분</b>을 만나요.
        </p>
        <p class="head__lead">
          편하게, 솔직하게 적어주세요. 다른 신청자에게는 이름을 가린 간략한 카드만 보이고,
          서로 마음을 확인하기 전까지 누구인지 알 수 없어요.
        </p>
      </header>

      <section v-if="locked" class="locked locked--bar" role="status">
        <i class="dx-icon-lock locked__icon" aria-hidden="true" />
        <div>
          <h2 class="display">{{ (LOCK[lockReason] ?? LOCK.MATCHING).title }}</h2>
          <p>{{ (LOCK[lockReason] ?? LOCK.MATCHING).text }}</p>
        </div>
      </section>

      <section v-if="blocked" class="locked" role="alert">
        <i class="dx-icon-clear locked__icon" aria-hidden="true" />
        <h2 class="display">지금은 사緣에 신청할 수 없는 계정이에요</h2>
        <p>운영 정책에 따라 신청이 제한되어 있어요.</p>
        <DxButton text="홈으로" styling-mode="outlined" @click="router.push({ name: 'home' })" />
      </section>

      <div v-else class="layout">
        <section class="sheet" aria-label="신청서">
          <p class="verified">
            <i class="dx-icon-check" aria-hidden="true" />
            사내 계정 인증 완료 · <span class="mono">{{ session.user?.adId }}</span>
          </p>

          <ApplicantForm v-if="form" ref="formComp" :form-data="form" :read-only="locked" @change="onChange" />
          <div v-else class="sheet__loading" />

          <div class="actions">
            <DxButton
              v-if="!locked"
              class="actions__submit"
              :text="editing ? '수정 내용 저장' : '신청하기'"
              type="default"
              :disabled="saving || !form"
              @click="submit"
            />
            <DxButton :text="locked ? '홈으로' : '취소'" styling-mode="outlined" @click="router.push({ name: 'home' })" />
            <DxButton v-if="editing" text="신청 철회" styling-mode="text" class="actions__withdraw" @click="withdraw" />
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
            <div class="boost">
              <p class="boost__label">
                추천 정확도 <b>{{ readiness.pct }}%</b>
              </p>
              <div class="boost__bar" role="progressbar" :aria-valuenow="readiness.pct" aria-valuemin="0" aria-valuemax="100">
                <span :style="{ width: `${readiness.pct}%` }" />
              </div>
              <p v-if="readiness.missing.length" class="boost__hint">
                <b>{{ readiness.missing.slice(0, 2).map((m) => m.label).join(', ') }}</b>{{ readiness.missing.length > 2 ? ` 외 ${readiness.missing.length - 2}개` : '' }}를 채우면 더 잘 맞는 분을 찾아드려요.
              </p>
              <p v-else class="boost__hint">완벽해요! 가장 정확하게 추천해 드릴게요.</p>
            </div>
            <p class="progress__lock">
              <i class="dx-icon-lock" aria-hidden="true" />
              입력한 내용은 암호화되어 전송·보관돼요.
            </p>
          </div>
        </aside>
      </div>
    </div>

    <Transition name="nudge">
      <div v-if="nudge" class="nudge" role="status">
        <span class="nudge__pct mono">{{ nudge.pct }}%</span>
        <span>{{ nudge.text }}</span>
      </div>
    </Transition>

    <DxPopup
      v-model:visible="boostPopup"
      :width="440"
      max-width="calc(100vw - 32px)"
      height="auto"
      :show-title="false"
      :hide-on-outside-click="true"
      :wrapper-attr="{ class: 'sa-popup tone-warm' }"
    >
      <div class="boostpop">
        <p class="boostpop__pct display">{{ readiness.pct }}<small>%</small></p>
        <h2 class="display">조금만 더 알려주시면 더 잘 맞는 분을 찾아드려요</h2>
        <p>필수 항목은 다 채웠어요. 아래 선택 항목을 채우면 추천 정확도가 올라가요.</p>
        <ul class="boostpop__list">
          <li v-for="m in readiness.missing.slice(0, 5)" :key="m.key">{{ m.label }}</li>
        </ul>
        <div class="boostpop__actions">
          <DxButton text="채우러 갈게요" type="default" @click="goFillOptional" />
          <DxButton :text="editing ? '이대로 저장할게요' : '이대로 신청할게요'" styling-mode="text" @click="save" />
        </div>
      </div>
    </DxPopup>

    <DxLoadPanel :visible="saving" message="안전하게 보내는 중이에요" :shading="true" shading-color="rgba(20,40,160,0.2)" />
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
.boost {
  margin-top: 16px;
  padding-top: 14px;
  border-top: 1px solid var(--c-line);
}
.boost__label {
  font-size: 14px;
  color: var(--c-ink-2);
}
.boost__label b {
  color: var(--c-indigo);
  font-size: 18px;
}
.boost__bar {
  height: 6px;
  margin: 8px 0 8px;
  border-radius: 999px;
  background: #e7e8f6;
  overflow: hidden;
}
.boost__bar span {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, var(--c-indigo-3), var(--c-crimson));
  transition: width 0.35s ease;
}
.boost__hint {
  color: var(--c-mute);
  font-size: 12.5px;
}
.boost__hint b {
  color: var(--c-ink-2);
}
.head__quick {
  margin-top: 12px;
  padding: 12px 16px;
  border-radius: var(--r-md);
  background: var(--c-blush-soft);
  border-left: 4px solid var(--c-crimson);
  color: var(--c-ink-2);
}
.head__quick b {
  color: var(--c-crimson-deep);
}
.actions__withdraw {
  margin-left: auto;
}
.actions__withdraw :deep(.dx-button-text) {
  color: var(--c-mute);
}
.locked--bar {
  grid-template-columns: auto 1fr;
  justify-items: start;
  align-items: center;
  max-width: none;
  margin: 20px 0 0;
  padding: 16px 20px;
  text-align: left;
  background: #f6edd6;
  border-color: #eadbb0;
}
.locked--bar h2 {
  font-size: 17px;
}
.locked {
  display: grid;
  justify-items: center;
  gap: 12px;
  max-width: 640px;
  margin: 28px auto 0;
  padding: 44px 24px;
  background: var(--c-surface);
  border: 1px solid var(--c-line);
  border-radius: var(--r-lg);
  text-align: center;
}
.locked__icon {
  font-size: 32px;
  color: var(--c-crimson);
}
.locked h2 {
  font-size: 22px;
  color: var(--c-indigo);
}
.locked p {
  color: var(--c-ink-2);
}
.nudge {
  position: fixed;
  left: 50%;
  bottom: 24px;
  z-index: 1600;
  display: flex;
  align-items: center;
  gap: 10px;
  max-width: calc(100vw - 32px);
  padding: 12px 18px 12px 12px;
  border-radius: 999px;
  background: var(--c-indigo);
  color: #fff;
  box-shadow: var(--shadow-2);
  font-size: 14px;
  transform: translateX(-50%);
}
.nudge__pct {
  flex: none;
  display: grid;
  place-items: center;
  min-width: 46px;
  height: 30px;
  padding: 0 8px;
  border-radius: 999px;
  background: var(--c-crimson);
  font-size: 13px;
}
.nudge-enter-active,
.nudge-leave-active {
  transition: opacity 0.25s ease, transform 0.25s ease;
}
.nudge-enter-from,
.nudge-leave-to {
  opacity: 0;
  transform: translate(-50%, 16px);
}
.boostpop {
  display: grid;
  justify-items: center;
  gap: 10px;
  padding: 14px 6px 4px;
  text-align: center;
}
.boostpop .boostpop__pct {
  font-size: 48px;
  line-height: 1;
  color: var(--c-crimson);
}
.boostpop .boostpop__pct small {
  font-size: 20px;
}
.boostpop h2 {
  font-size: 19px;
  color: var(--c-indigo);
}
.boostpop p {
  color: var(--c-ink-2);
  font-size: 14px;
}
.boostpop__list {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 6px;
  margin: 4px 0 6px;
  padding: 0;
  list-style: none;
}
.boostpop__list li {
  padding: 3px 10px;
  border-radius: 999px;
  background: var(--c-blush-soft);
  color: var(--c-crimson-deep);
  font-size: 13px;
}
.boostpop__actions {
  display: grid;
  gap: 4px;
  width: 100%;
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
