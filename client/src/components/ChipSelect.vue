<script setup>
/** 여러 개 고르는 칩 버튼 — 선호 얼굴상처럼 한눈에 보고 고르는 항목용 */
const props = defineProps({
  modelValue: { type: Array, default: () => [] },
  items: { type: Array, required: true }, // [{ value, text }]
  readOnly: { type: Boolean, default: false },
  emptyText: { type: String, default: '상관없어요' },
});
const emit = defineEmits(['update:modelValue']);

function toggle(v) {
  if (props.readOnly) return;
  const cur = props.modelValue ?? [];
  emit('update:modelValue', cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v]);
}
</script>

<template>
  <div class="chips" role="group">
    <button
      v-for="it in items"
      :key="it.value"
      type="button"
      class="chips__item"
      :class="{ 'is-on': modelValue?.includes(it.value) }"
      :aria-pressed="modelValue?.includes(it.value) ? 'true' : 'false'"
      :disabled="readOnly && !modelValue?.includes(it.value)"
      @click="toggle(it.value)"
    >
      {{ it.text }}
    </button>
    <span v-if="!modelValue?.length" class="chips__empty">{{ emptyText }}</span>
  </div>
</template>

<style scoped>
.chips {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}
.chips__item {
  padding: 7px 14px;
  border: 1px solid var(--c-line-strong);
  border-radius: 999px;
  background: var(--c-surface);
  color: var(--c-ink-2);
  font: inherit;
  font-size: 14px;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s;
}
.chips__item:hover:not(:disabled) {
  border-color: var(--c-crimson);
}
.chips__item.is-on {
  border-color: var(--c-crimson);
  background: var(--c-crimson);
  color: #fff;
  font-weight: 600;
}
.chips__item:disabled {
  opacity: 0.35;
  cursor: default;
}
.chips__empty {
  margin-left: 4px;
  color: var(--c-mute);
  font-size: 13px;
}
</style>
