<script setup>
/**
 * 신청서 화면
 *  - 처음 신청: 설문처럼 4페이지(나는 이런 사람 · 나의 모습 · 나의 일상 · 이런 분이면 좋겠어요)를 한 페이지씩.
 *    위에 진행 상황(지금 페이지 · 남은 페이지)이 고정으로 보이고, 오른쪽에 필수 항목·추천 정확도가 보인다.
 *    정규 신청과 인연 사주에서 하트를 보내며 하는 신청이 같은 양식이다 (사주는 신청과 함께 하트가 간다)
 *  - 신청 후 수정: 모든 항목을 한 화면에
 */
import { ref, reactive, computed, onMounted, onBeforeUnmount, nextTick } from 'vue';
import { useRoute, useRouter, onBeforeRouteLeave } from 'vue-router';
import { DxButton } from 'devextreme-vue/button';
import { DxLoadPanel } from 'devextreme-vue/load-panel';
import { DxPopup } from 'devextreme-vue/popup';
import notify from 'devextreme/ui/notify';
import { confirm } from 'devextreme/ui/dialog';
import { api } from '@/api';
import { session, flash, refreshUser } from '@/stores/session';
import {
  emptyForm, toFormModel, fromFormModel, sectionProgress, matchReadiness, OPTIONAL_BOOSTERS, SECTIONS, pageOfField,
} from '@shared/utils/applicationModel';
import ApplicantForm from '@/components/ApplicantForm.vue';

const router = useRouter();
const route = useRoute();
/** 인연 사주에서 왔는가 — 사주 인연에게 하트를 보내려고 신청하는 중이면 신청과 함께 하트가 간다 */
const fromSaju = route.query.from === 'saju';
const SAJU_KEY = 'sayeon.sajuApply';
function takeSaju() {
  try {
    const d = JSON.parse(sessionStorage.getItem(SAJU_KEY) ?? 'null');
    sessionStorage.removeItem(SAJU_KEY);
    return d && typeof d === 'object' ? d : null;
  } catch {
    return null;
  }
}
/** { to: 하트 받을 사람 닉네임, birthYear } — 사주 화면이 넘겨준 값 */
const saju = ref(null);

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

// ── 페이지 (처음 신청할 때만) ──
const page = ref(0);
const reached = ref(0); // 지금까지 들어가 본 가장 뒤 페이지
const wizard = computed(() => Boolean(form.value) && !editing.value && !locked.value);
const lastPage = SECTIONS.length - 1;
const sheetEl = ref();

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
    saju.value = !mine && fromSaju ? takeSaju() : null;
    // 사주에서 입력한 생년월일의 연도만 미리 채운다 (월·일은 저장하지 않는다)
    if (saju.value?.birthYear) base.birthYear = saju.value.birthYear;
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
const current = computed(() => sections.value[page.value] ?? { done: 0, total: 0, title: '' });
const left = computed(() => lastPage - page.value);

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

/** 지금 페이지 검사 — 문제가 있으면 알려 주고 false */
function checkPage() {
  const result = formComp.value.validate();
  if (result.isValid) return true;
  notify({ message: `확인이 필요한 항목이 ${result.count}개 있어요. 빨간 표시를 확인해 주세요.`, type: 'warning', displayTime: 3000 });
  result.focus();
  return false;
}

async function toTop() {
  await nextTick();
  const y = (sheetEl.value?.getBoundingClientRect().top ?? 0) + window.scrollY - 140;
  window.scrollTo({ top: Math.max(0, y), behavior: 'smooth' });
}

/** 다른 페이지로 — 앞으로 갈 때는 지금 페이지를 먼저 검사한다 (뒤로는 그냥) */
function goPage(i) {
  if (i === page.value || i < 0 || i > lastPage) return;
  if (i > page.value) {
    if (i > reached.value + 1 && i > page.value + 1) return; // 아직 안 가 본 페이지를 건너뛰지 않는다
    if (!checkPage()) return;
  }
  page.value = i;
  reached.value = Math.max(reached.value, i);
  toTop();
}

/** 선택 항목으로 이동 (팝업의 '채우러 갈게요') */
function goFillOptional() {
  boostPopup.value = false;
  const first = readiness.value.missing[0];
  const i = first ? pageOfField(first.key) : 0;
  if (wizard.value) {
    formComp.value?.revealOptional(i);
    page.value = i;
    toTop();
  } else scrollToSection(SECTIONS[i].key);
}

function scrollToSection(key) {
  document.querySelector(`.sec-${key}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
function onSectionClick(i) {
  if (wizard.value) goPage(i);
  else scrollToSection(SECTIONS[i].key);
}

async function submit() {
  if (!checkPage()) return;
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
    let heart = null; // 사주 인연에게 보낸 하트 결과
    if (editing.value) {
      await api.application.update(payload);
      flash.applied = 'updated';
    } else if (saju.value?.to) {
      try {
        heart = await api.saju.apply(payload); // 신청 + 사주 인연에게 하트
      } catch (e) {
        // 그새 상대 상황이 바뀌었으면 신청만 한다 (하트는 사주 화면에서 다시)
        if (e.code !== 'CANDIDATE_GONE') throw e;
        await api.application.create(payload);
        notify({ message: '그새 사주 인연의 상황이 바뀌어 하트는 보내지 못했어요. 신청은 완료됐어요.', type: 'warning', displayTime: 4500 });
      }
    } else {
      await api.application.create(payload);
    }
    dirty.value = false;
    await refreshUser(); // 신청 상태(GUEST→APPLICANT 등)를 헤더·라우팅에 반영
    if (editing.value) {
      notify({ message: '신청서를 저장했어요. 바뀐 선호는 다음 후보부터 반영돼요.', type: 'success', displayTime: 3000 });
      router.push({ name: 'home' });
    } else {
      const query = fromSaju ? { from: 'saju', ...(heart && { heart: heart.to ?? saju.value.to, ...(heart.matched && { matched: '1' }) }) } : {};
      router.push({ name: 'apply-done', query });
    }
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
        <p v-if="saju?.to && !editing" class="head__quick">
          <b>♥ {{ saju.to }}</b>님에게 하트를 보내려면 신청서를 써 주세요. <b>4페이지</b>, 필수 항목만 채우면 되고
          신청하는 순간 하트가 함께 전해져요.
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

      <template v-else>
        <!-- 처음 신청: 위에 고정되는 진행 상황 -->
        <nav v-if="wizard" class="steps" aria-label="신청서 진행 상황">
          <div class="steps__top">
            <p class="steps__now">
              <span class="steps__no mono">{{ page + 1 }} / {{ SECTIONS.length }}</span>
              <b>{{ SECTIONS[page].title }}</b>
              <span class="steps__req">이 페이지 필수 {{ current.done }}/{{ current.total }}</span>
            </p>
            <p class="steps__left">
              <template v-if="left > 0">남은 페이지 <b>{{ left }}</b> · 약 {{ left }}분</template>
              <template v-else><b>마지막 페이지예요</b></template>
              <span class="steps__acc">추천 정확도 {{ readiness.pct }}%</span>
            </p>
          </div>
          <ol class="steps__list">
            <li
              v-for="(s, i) in sections"
              :key="s.key"
              :class="{ 'is-now': i === page, 'is-done': i < page || (i <= reached && s.done === s.total && i !== page) }"
            >
              <button type="button" :disabled="i > reached + 1" :aria-current="i === page ? 'step' : undefined" @click="goPage(i)">
                <span class="steps__dot mono">{{ i < page ? '✓' : i + 1 }}</span>
                <span class="steps__name">{{ SECTIONS[i].short }}</span>
              </button>
            </li>
          </ol>
        </nav>

        <div class="layout">
          <section ref="sheetEl" class="sheet" aria-label="신청서">
            <p class="verified">
              <i class="dx-icon-check" aria-hidden="true" />
              사내 계정 인증 완료 · <span class="mono">{{ session.user?.adId }}</span>
            </p>
            <h2 v-if="wizard" class="sheet__title display">{{ SECTIONS[page].title }}</h2>

            <ApplicantForm
              v-if="form"
              ref="formComp"
              :form-data="form"
              :read-only="locked"
              :page="wizard ? page : null"
              :compact="wizard"
              @change="onChange"
            />
            <div v-else class="sheet__loading" />

            <div v-if="wizard" class="actions">
              <DxButton v-if="page > 0" text="← 이전" styling-mode="outlined" @click="goPage(page - 1)" />
              <DxButton
                v-if="page < lastPage"
                class="actions__submit"
                :text="`다음 · ${SECTIONS[page + 1].short} →`"
                type="default"
                @click="goPage(page + 1)"
              />
              <DxButton
                v-else
                class="actions__submit"
                :text="saju?.to ? `신청하고 ${saju.to}님에게 하트 보내기 ♥` : '신청하기'"
                type="default"
                :disabled="saving"
                @click="submit"
              />
              <DxButton text="나중에 할게요" styling-mode="text" class="actions__withdraw" @click="router.push({ name: 'home' })" />
            </div>
            <div v-else class="actions">
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

          <aside class="progress" :class="{ 'progress--wizard': wizard }" aria-label="작성 진행률">
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
                <li v-for="(s, i) in sections" :key="s.key" :class="{ 'is-done': s.done === s.total, 'is-now': wizard && i === page }">
                  <button type="button" :disabled="wizard && i > reached + 1" @click="onSectionClick(i)">
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
                <button v-if="readiness.missing.length && !locked" type="button" class="boost__go" @click="goFillOptional">채우러 가기 →</button>
              </div>
              <p class="progress__lock">
                <i class="dx-icon-lock" aria-hidden="true" />
                입력한 내용은 암호화되어 전송·보관돼요.
              </p>
            </div>
          </aside>
        </div>
      </template>
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
          <DxButton :text="editing ? '이대로 저장할게요' : saju?.to ? '이대로 신청하고 하트 보낼게요' : '이대로 신청할게요'" styling-mode="text" @click="save" />
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

/* ── 처음 신청: 위에 고정되는 진행 상황 ── */
.steps {
  position: sticky;
  top: var(--header-h);
  z-index: 20;
  margin: 24px 0 0;
  padding: 12px 18px 10px;
  border: 1px solid var(--c-line);
  border-radius: var(--r-lg);
  background: rgba(255, 255, 255, 0.96);
  backdrop-filter: blur(8px);
  box-shadow: var(--shadow-1);
}
.steps__top {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: space-between;
  gap: 4px 16px;
}
.steps__now {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 4px 10px;
  color: var(--c-ink);
}
.steps__no {
  padding: 1px 8px;
  border-radius: 999px;
  background: var(--c-indigo);
  color: #fff;
  font-size: 12.5px;
}
.steps__now b {
  font-size: 16px;
  color: var(--c-indigo);
}
.steps__req {
  color: var(--c-mute);
  font-size: 13px;
}
.steps__left {
  display: flex;
  align-items: baseline;
  gap: 10px;
  color: var(--c-ink-2);
  font-size: 13.5px;
}
.steps__left b {
  color: var(--c-crimson-deep);
}
.steps__acc {
  padding: 1px 8px;
  border-radius: 999px;
  background: #e7e8f6;
  color: var(--c-indigo);
  font-size: 12.5px;
  font-weight: 600;
}
.steps__list {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 6px;
  margin: 10px 0 0;
  padding: 0;
  list-style: none;
}
.steps__list li {
  position: relative;
  padding-top: 8px;
  border-top: 4px solid var(--c-line);
}
.steps__list li.is-done {
  border-top-color: var(--c-crimson);
}
.steps__list li.is-now {
  border-top-color: var(--c-indigo);
}
.steps__list button {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  padding: 0;
  border: 0;
  background: none;
  color: var(--c-mute);
  font: inherit;
  font-size: 13px;
  text-align: left;
  cursor: pointer;
}
.steps__list button:disabled {
  cursor: default;
  opacity: 0.6;
}
.steps__list .is-now button {
  color: var(--c-indigo);
  font-weight: 700;
}
.steps__list .is-done button {
  color: var(--c-crimson-deep);
}
.steps__dot {
  display: grid;
  flex: none;
  place-items: center;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: var(--c-line);
  color: var(--c-ink-2);
  font-size: 11px;
}
.is-now .steps__dot {
  background: var(--c-indigo);
  color: #fff;
}
.is-done .steps__dot {
  background: var(--c-crimson);
  color: #fff;
}
.sheet__title {
  margin: 0 0 18px;
  font-size: 22px;
  color: var(--c-indigo);
}
.progress__list li.is-now button {
  color: var(--c-indigo);
  font-weight: 700;
}
.progress__list button:disabled {
  cursor: default;
  opacity: 0.55;
}
.boost__go {
  margin-top: 8px;
  padding: 0;
  border: 0;
  background: none;
  color: var(--c-indigo);
  font: inherit;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}
@media (max-width: 991px) {
  /* 좁은 화면 처음 신청: 위 진행 상황만 (오른쪽 카드는 숨김 — 추천 정확도는 위에 같이 보인다) */
  .progress--wizard {
    display: none;
  }
  .steps {
    margin: 16px calc(var(--gutter) * -1) 0;
    border-radius: 0;
    border-width: 0 0 1px;
  }
}
@media (max-width: 575px) {
  .steps__name {
    display: none;
  }
  .steps__list button {
    justify-content: center;
  }
}
</style>
