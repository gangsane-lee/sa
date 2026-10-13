<script setup>
/** 신청자 본인에게 보이는 상태 — 매칭 대기 중 / 매칭 중 두 가지뿐 */
import { computed } from 'vue';
import { USER_STATUS_MAP } from '@/constants/codes';

const props = defineProps({
  status: { type: String, required: true },
  large: { type: Boolean, default: false },
});
const text = computed(() => USER_STATUS_MAP[props.status]?.text ?? '매칭 대기 중');
</script>

<template>
  <span class="ustatus" :class="[`ustatus--${status}`, { 'ustatus--lg': large }]">
    <span class="ustatus__dot" aria-hidden="true" />
    {{ text }}
  </span>
</template>

<style scoped>
.ustatus {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 4px 12px;
  border-radius: 999px;
  font-size: 13px;
  font-weight: 600;
  background: #e7e8f6;
  color: var(--c-indigo-3);
}
.ustatus--lg {
  padding: 7px 16px;
  font-size: 16px;
}
.ustatus__dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: currentColor;
  animation: pulse 1.8s ease-in-out infinite;
}
.ustatus--MATCHING {
  background: var(--c-blush);
  color: var(--c-crimson-deep);
}
@keyframes pulse {
  50% {
    opacity: 0.35;
  }
}
@media (prefers-reduced-motion: reduce) {
  .ustatus__dot {
    animation: none;
  }
}
</style>
