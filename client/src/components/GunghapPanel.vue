<script setup>
/** 나와 오늘의 후보의 사주 궁합 (서버가 계산한 결과만 받는다 — 상대 생년월일은 오지 않음) */
import { computed } from 'vue';
import { RouterLink } from 'vue-router';
import { ELEMENTS } from '@/utils/saju';

const props = defineProps({
  gunghap: { type: Object, default: null },
  nickname: { type: String, default: '' },
});
const ring = computed(() => {
  const s = props.gunghap?.score ?? 0;
  const c = 2 * Math.PI * 42;
  return { dash: `${(s / 100) * c} ${c}` };
});
const el = (e) => ELEMENTS[e] ?? {};
</script>

<template>
  <aside class="gh" aria-label="사주 궁합">
    <p class="gh__eyebrow">인연 사주 궁합</p>
    <template v-if="gunghap">
      <div class="gh__top">
        <svg class="gh__ring" viewBox="0 0 100 100" aria-hidden="true">
          <circle cx="50" cy="50" r="42" class="gh__track" />
          <circle cx="50" cy="50" r="42" class="gh__bar" :stroke-dasharray="ring.dash" transform="rotate(-90 50 50)" />
        </svg>
        <div class="gh__score">
          <b class="display">{{ gunghap.score }}</b><span>점</span>
        </div>
      </div>
      <h3 class="gh__title display">{{ gunghap.title }}</h3>
      <div class="gh__pair">
        <span class="gh__el" :style="{ background: el(gunghap.me.element).color }">나 · {{ el(gunghap.me.element).name }}({{ el(gunghap.me.element).hanja }})</span>
        <span class="gh__x" aria-hidden="true">♥</span>
        <span class="gh__el" :style="{ background: el(gunghap.them.element).color }">{{ nickname || '상대' }} · {{ el(gunghap.them.element).name }}({{ el(gunghap.them.element).hanja }})</span>
      </div>
      <p class="gh__text">{{ gunghap.text }}</p>
      <ul class="gh__points">
        <li v-for="p in gunghap.points" :key="p">{{ p }}</li>
      </ul>
      <p class="gh__note">재미로 보는 궁합이에요. 상대의 생년월일은 공개되지 않아요. <RouterLink :to="{ name: 'saju' }">내 사주 자세히 보기</RouterLink></p>
    </template>
    <p v-else class="gh__empty">궁합을 계산하지 못했어요.</p>
  </aside>
</template>

<style scoped>
.gh {
  display: grid;
  gap: 10px;
  align-content: start;
  padding: 20px;
  border-radius: var(--r-lg);
  background: var(--c-indigo);
  color: var(--c-on-indigo);
}
.gh__eyebrow {
  color: var(--c-thread-on-dark);
  font-size: 12.5px;
  font-weight: 700;
  letter-spacing: 0.04em;
}
.gh__top {
  position: relative;
  width: 120px;
  height: 120px;
  margin: 2px auto 0;
}
.gh__ring {
  width: 100%;
  height: 100%;
}
.gh__track {
  fill: none;
  stroke: rgba(255, 255, 255, 0.12);
  stroke-width: 8;
}
.gh__bar {
  fill: none;
  stroke: var(--c-thread-on-dark);
  stroke-width: 8;
  stroke-linecap: round;
  transition: stroke-dasharray 0.6s ease;
}
.gh__score {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: baseline;
  justify-content: center;
  padding-top: 36px;
}
.gh__score b {
  font-size: 40px;
  color: #fff;
  line-height: 1;
}
.gh__score span {
  margin-left: 2px;
  color: var(--c-on-indigo-mute);
}
.gh__title {
  font-size: 19px;
  color: #fff;
  text-align: center;
}
.gh__pair {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  align-items: center;
  gap: 6px;
}
.gh__el {
  padding: 3px 10px;
  border-radius: 999px;
  color: #fff;
  font-size: 12.5px;
  font-weight: 600;
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.25);
}
.gh__x {
  color: var(--c-thread-on-dark);
}
.gh__text {
  color: var(--c-on-indigo-mute);
  font-size: 14px;
}
.gh__points {
  display: grid;
  gap: 6px;
  margin: 0;
  padding: 0;
  list-style: none;
}
.gh__points li {
  padding: 8px 10px;
  border-radius: var(--r-sm);
  background: rgba(255, 255, 255, 0.07);
  font-size: 13.5px;
}
.gh__note {
  color: var(--c-on-indigo-mute);
  font-size: 12px;
}
.gh__note a {
  color: #fff;
}
.gh__empty {
  color: var(--c-on-indigo-mute);
}
</style>
