<script setup>
/**
 * 매칭 후기 — 만남 결과 · 상대 평가 · 추가 매칭 · 담당자에게 코멘트
 * 평가와 코멘트는 담당자만 본다. 상대에게는 어떤 형태로도 전달하지 않는다.
 */
import { reactive, computed, watch } from 'vue';
import { DxButton } from 'devextreme-vue/button';
import { DxTextArea } from 'devextreme-vue/text-area';
import { REVIEW_OUTCOMES, REVIEW_RATINGS } from '@shared/constants/codes';

const props = defineProps({
  initial: { type: Object, default: null },
  busy: { type: Boolean, default: false },
  /** 진행 중인(서로 수락한) 매칭일 때만 '커플 완료'를 고를 수 있다 */
  canCouple: { type: Boolean, default: false },
});
const emit = defineEmits(['submit', 'cancel']);

const f = reactive({ outcome: null, rating: null, wantMore: null, couple: false, comment: '' });
watch(
  () => props.initial,
  (v) => Object.assign(f, { outcome: v?.outcome ?? null, rating: v?.rating ?? null, wantMore: v?.wantMore ?? null, couple: false, comment: v?.comment ?? '' }),
  { immediate: true },
);
/** '앞으로는?' 선택 — 만났으면 새 인연 / 이어가기 / 커플 완료, 못 만났으면 새 인연 / 쉬기 */
const next = computed({
  get: () => (f.couple ? 'COUPLE' : f.wantMore === true ? 'MORE' : f.wantMore === false ? 'KEEP' : null),
  set: (v) => Object.assign(f, { wantMore: v === 'MORE', couple: v === 'COUPLE' }),
});

const met = computed(() => f.outcome === 'MET');
const ready = computed(() => f.outcome && f.rating && f.wantMore !== null && f.comment.length <= 300);
/** 결과를 고르면 추가 매칭 기본값을 제안 (못 만났으면 대개 다시 받고 싶어 한다) */
watch(
  () => f.outcome,
  (o) => {
    if (o && f.wantMore === null) f.wantMore = o !== 'MET';
    if (o !== 'MET') f.couple = false;
  },
);
const consequence = computed(() => {
  if (!f.outcome || f.wantMore === null) return '';
  if (!met.value && f.wantMore) return "이 매칭은 끝나고 '매칭 대기 중'으로 돌아가요. 내일부터 새 후보가 도착해요.";
  if (!met.value) return '이 매칭은 끝나고 매칭을 잠시 쉬어요. 마이페이지에서 언제든 다시 받을 수 있어요.';
  if (f.couple) return '축하해요! 두 분의 매칭을 커플 성사로 최종 완료해요. 상대 화면에도 함께 반영되고, 새 후보·하트는 더 이상 오지 않아요.';
  if (f.wantMore) return "이 매칭은 끝나고 두 분 모두 '매칭 대기 중'으로 돌아가요.";
  return '두 분의 매칭이 이어져요. 나중에 추가 매칭을 원하면 여기서 바꿀 수 있어요.';
});
</script>

<template>
  <form class="rv" @submit.prevent="ready && emit('submit', { ...f, comment: f.comment.trim() })">
    <fieldset>
      <legend>만남 결과</legend>
      <div class="rv__opts">
        <label v-for="o in REVIEW_OUTCOMES" :key="o.value" class="rv__opt" :class="{ 'is-on': f.outcome === o.value }">
          <input v-model="f.outcome" type="radio" name="outcome" :value="o.value" />
          {{ o.text }}
        </label>
      </div>
    </fieldset>

    <fieldset>
      <legend>상대는 어땠나요? <small>· 담당자만 봐요</small></legend>
      <div class="rv__rate">
        <label v-for="o in REVIEW_RATINGS" :key="o.value" class="rv__thumb" :class="[`is-${o.value}`, { 'is-on': f.rating === o.value }]">
          <input v-model="f.rating" type="radio" name="rating" :value="o.value" />
          <span aria-hidden="true">{{ o.value === 'LIKE' ? '👍' : '👎' }}</span>
          {{ o.text }}
        </label>
      </div>
    </fieldset>

    <fieldset>
      <legend>앞으로는 어떻게 할까요?</legend>
      <div class="rv__opts">
        <label class="rv__opt" :class="{ 'is-on': next === 'MORE' }">
          <input v-model="next" type="radio" name="more" value="MORE" /> 새 인연도 만나볼래요
        </label>
        <label class="rv__opt" :class="{ 'is-on': next === 'KEEP' }">
          <input v-model="next" type="radio" name="more" value="KEEP" />
          {{ met ? '이 분과 조금 더 이어갈래요' : '잠시 쉴게요' }}
        </label>
        <label v-if="met && canCouple" class="rv__opt rv__opt--couple" :class="{ 'is-on': next === 'COUPLE' }">
          <input v-model="next" type="radio" name="more" value="COUPLE" /> 💑 커플이 되었어요 · 최종 완료
        </label>
      </div>
      <p v-if="consequence" class="rv__note">{{ consequence }}</p>
    </fieldset>

    <fieldset>
      <legend>담당자에게 남길 말 <small>· 선택</small></legend>
      <DxTextArea
        v-model:value="f.comment"
        :max-length="300"
        :height="80"
        placeholder="예: 대화가 잘 통했어요 / 다음엔 같은 캠퍼스 분이면 좋겠어요"
        :input-attr="{ 'aria-label': '담당자에게 남길 말' }"
      />
    </fieldset>

    <p class="rv__privacy">
      <i class="dx-icon-lock" aria-hidden="true" />
      평가와 코멘트는 매칭 담당자만 봐요. 상대에게는 어떤 형태로도 전해지지 않아요.
      '별로였어요'가 여러 번 쌓인 분은 추천에서 빠져요.
    </p>
    <div class="rv__actions">
      <DxButton :text="initial ? '후기 고치기' : '후기 남기기'" type="default" :use-submit-behavior="true" :disabled="!ready || busy" />
      <DxButton v-if="initial" text="취소" styling-mode="text" @click="emit('cancel')" />
    </div>
  </form>
</template>

<style scoped>
.rv {
  display: grid;
  gap: 16px;
}
fieldset {
  margin: 0;
  padding: 0;
  border: 0;
  min-width: 0;
}
legend {
  margin-bottom: 8px;
  font-weight: 600;
  font-size: 14.5px;
  color: var(--c-indigo);
}
legend small {
  color: var(--c-mute);
  font-weight: 400;
}
.rv__opts,
.rv__rate {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
input[type='radio'] {
  position: absolute;
  opacity: 0;
  pointer-events: none;
}
.rv__opt,
.rv__thumb {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  border: 1px solid var(--c-line-strong);
  border-radius: 999px;
  background: var(--c-surface);
  font-size: 14px;
  cursor: pointer;
}
.rv__opt:focus-within,
.rv__thumb:focus-within {
  outline: 2px solid var(--c-crimson);
  outline-offset: 2px;
}
.rv__opt.is-on {
  border-color: var(--c-indigo-3);
  background: #e7e8f6;
  color: var(--c-indigo);
  font-weight: 600;
}
.rv__thumb.is-on.is-LIKE {
  border-color: var(--c-ok);
  background: var(--c-ok-bg);
  color: var(--c-ok);
  font-weight: 600;
}
.rv__thumb.is-on.is-DISLIKE {
  border-color: var(--c-crimson);
  background: var(--c-blush);
  color: var(--c-crimson-deep);
  font-weight: 600;
}
.rv__note {
  margin-top: 8px;
  color: var(--c-ink-2);
  font-size: 13px;
}
.rv__privacy {
  display: flex;
  gap: 6px;
  padding: 10px 12px;
  border-radius: var(--r-md);
  background: var(--c-paper);
  color: var(--c-mute);
  font-size: 12.5px;
}
.rv__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.rv__actions :deep(.dx-button) {
  height: 46px;
}
.rv__opt--couple.is-on {
  border-color: var(--c-crimson);
  background: var(--c-blush-soft);
  color: var(--c-crimson-deep);
  font-weight: 700;
}
</style>
