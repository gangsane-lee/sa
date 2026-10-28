<script setup>
/**
 * 선호 우선순위 선택 — 선호 항목 중에서 중요한 순서대로 누른다.
 * 값: ['AGE', 'SMOKING', ...] (앞쪽일수록 중요). 선호를 고르지 않은(상관없음) 항목은 누를 수 없다.
 */
import { computed } from 'vue';
import { PREF_ITEMS, PREF_ITEM_MAP, MAX_PRIORITIES } from '@shared/constants/codes';

const props = defineProps({
  modelValue: { type: Array, default: () => [] },
  /** 지금 선호가 채워진 항목 값 목록 */
  available: { type: Array, default: () => [] },
  readOnly: { type: Boolean, default: false },
  error: { type: String, default: '' },
});
const emit = defineEmits(['update:modelValue']);

const picked = computed(() => props.modelValue ?? []);
const full = computed(() => picked.value.length >= MAX_PRIORITIES);

function toggle(v) {
  if (props.readOnly) return;
  if (picked.value.includes(v)) emit('update:modelValue', picked.value.filter((x) => x !== v));
  else if (!full.value && props.available.includes(v)) emit('update:modelValue', [...picked.value, v]);
}
function move(i, d) {
  const arr = [...picked.value];
  const j = i + d;
  if (j < 0 || j >= arr.length) return;
  [arr[i], arr[j]] = [arr[j], arr[i]];
  emit('update:modelValue', arr);
}
</script>

<template>
  <div class="pp" :class="{ 'is-invalid': error }">
    <ol v-if="picked.length" class="pp__ranks" aria-label="고른 우선순위">
      <li v-for="(v, i) in picked" :key="v">
        <span class="pp__no mono">{{ i + 1 }}</span>
        <span class="pp__name">{{ PREF_ITEM_MAP[v]?.text ?? v }}</span>
        <template v-if="!readOnly">
          <button type="button" class="pp__mini" :disabled="i === 0" :aria-label="`${PREF_ITEM_MAP[v]?.text} 위로`" @click="move(i, -1)">↑</button>
          <button type="button" class="pp__mini" :disabled="i === picked.length - 1" :aria-label="`${PREF_ITEM_MAP[v]?.text} 아래로`" @click="move(i, 1)">↓</button>
          <button type="button" class="pp__mini" :aria-label="`${PREF_ITEM_MAP[v]?.text} 빼기`" @click="toggle(v)">✕</button>
        </template>
      </li>
    </ol>
    <p v-else class="pp__empty">아래에서 중요한 항목을 순서대로 눌러주세요.</p>

    <div v-if="!readOnly" class="pp__pool">
      <button
        v-for="p in PREF_ITEMS"
        :key="p.value"
        type="button"
        class="pp__chip"
        :class="{ 'is-on': picked.includes(p.value) }"
        :disabled="!picked.includes(p.value) && (!available.includes(p.value) || full)"
        :title="available.includes(p.value) ? '' : '위에서 이 항목의 선호를 먼저 골라주세요'"
        @click="toggle(p.value)"
      >
        <span v-if="picked.includes(p.value)" class="mono">{{ picked.indexOf(p.value) + 1 }}</span>
        {{ p.text }}
      </button>
    </div>
    <p v-if="error" class="pp__error" role="alert">{{ error }}</p>
  </div>
</template>

<style scoped>
.pp {
  padding: 14px;
  border: 1px solid var(--c-line);
  border-radius: var(--r-md);
  background: var(--c-paper);
}
.pp.is-invalid {
  border-color: var(--c-crimson);
}
.pp__ranks {
  list-style: none;
  margin: 0 0 12px;
  padding: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.pp__ranks li {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 6px 5px 5px;
  border-radius: 999px;
  background: var(--c-surface);
  border: 1px solid var(--c-blush);
  box-shadow: var(--shadow-1);
}
.pp__no {
  display: inline-grid;
  place-items: center;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: var(--c-crimson);
  color: #fff;
  font-size: 12px;
}
.pp__name {
  font-weight: 600;
  font-size: 14px;
  color: var(--c-indigo);
}
.pp__mini {
  width: 22px;
  height: 22px;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: transparent;
  color: var(--c-mute);
  font-size: 12px;
  cursor: pointer;
}
.pp__mini:hover:not(:disabled) {
  background: var(--c-blush-soft);
  color: var(--c-crimson-deep);
}
.pp__mini:disabled {
  opacity: 0.3;
  cursor: default;
}
.pp__empty {
  margin-bottom: 10px;
  color: var(--c-mute);
  font-size: 13.5px;
}
.pp__pool {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.pp__chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 6px 12px;
  border: 1px solid var(--c-line-strong);
  border-radius: 999px;
  background: var(--c-surface);
  color: var(--c-ink-2);
  font: inherit;
  font-size: 13.5px;
  cursor: pointer;
}
.pp__chip:hover:not(:disabled) {
  border-color: var(--c-crimson);
  color: var(--c-crimson-deep);
}
.pp__chip.is-on {
  border-color: var(--c-crimson);
  background: var(--c-blush-soft);
  color: var(--c-crimson-deep);
  font-weight: 600;
}
.pp__chip:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.pp__error {
  margin-top: 8px;
  color: var(--c-crimson-deep);
  font-size: 13px;
}
</style>
