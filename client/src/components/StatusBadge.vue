<script setup>
import { computed } from 'vue';
import { APPLY_STATUS, MATCH_STATUS, textOf } from '@/constants/codes';

const props = defineProps({
  status: { type: String, required: true },
  kind: { type: String, default: 'apply' }, // 'apply' | 'match'
});
const text = computed(() => textOf(props.kind === 'match' ? MATCH_STATUS : APPLY_STATUS, props.status));
</script>

<template>
  <span class="badge" :class="`badge--${status}`">{{ text }}</span>
</template>
