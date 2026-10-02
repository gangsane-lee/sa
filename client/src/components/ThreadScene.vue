<script setup>
/**
 * 히어로 일러스트 — 서비스의 시그니처.
 * 월하노인 설화처럼 달빛 아래에서 붉은 실이 두 사람을 잇는다.
 * 달은 웨이퍼(다이 격자 + 노치)로 그렸다 — 반도체 사람들끼리만 알아보는 작은 농담.
 * 실은 평택에서 출발해 매듭을 한 번 짓고 기흥에 닿는다(실제 지도상 방향과 같다).
 */
import { useId } from 'vue';

defineProps({
  from: { type: String, default: '평택캠퍼스의 당신' },
  to: { type: String, default: '기흥캠퍼스의 그 사람' },
});

const clipId = `wafer-${useId()}`;
const grid = [-24, -16, -8, 0, 8, 16, 24];
const THREAD =
  'M 88 318 C 140 312, 186 296, 220 262 C 254 228, 300 210, 298 168 ' +
  'C 296 128, 240 124, 234 162 C 228 200, 276 222, 332 206 C 370 196, 396 194, 420 196';
</script>

<template>
  <svg class="scene" viewBox="0 0 520 400" role="img" :aria-label="`${from}과 ${to}을 잇는 붉은 실`">
    <defs>
      <clipPath :id="clipId">
        <circle r="31" />
      </clipPath>
    </defs>

    <g class="moon" transform="translate(440 72)">
      <circle r="78" class="moon__halo" opacity="0.05" />
      <circle r="52" class="moon__halo" opacity="0.08" />
      <circle r="32" class="moon__disc" />
      <g :clip-path="`url(#${clipId})`" class="moon__grid">
        <line v-for="x in grid" :key="`v${x}`" :x1="x" y1="-32" :x2="x" y2="32" />
        <line v-for="y in grid" :key="`h${y}`" x1="-32" :y1="y" x2="32" :y2="y" />
      </g>
      <circle cy="32" r="3.2" class="moon__notch" />
    </g>

    <path :d="THREAD" pathLength="1" class="thread" />

    <g class="pin pin--from">
      <circle cx="88" cy="318" r="9" class="pin__ring" />
      <circle cx="88" cy="318" r="5" class="pin__dot" />
      <text x="88" y="354" text-anchor="middle" class="pin__label">{{ from }}</text>
    </g>
    <g class="pin pin--to">
      <circle cx="420" cy="196" r="9" class="pin__ring" />
      <circle cx="420" cy="196" r="5" class="pin__dot" />
      <text x="420" y="168" text-anchor="middle" class="pin__label">{{ to }}</text>
    </g>
  </svg>
</template>

<style scoped>
.scene {
  display: block;
  width: 100%;
  height: auto;
  overflow: visible;
}

.moon__halo,
.moon__disc {
  fill: var(--c-moon);
}
.moon__grid line {
  stroke: var(--c-indigo);
  stroke-opacity: 0.14;
  stroke-width: 0.8;
}
.moon__notch {
  fill: var(--c-indigo);
}

.thread {
  fill: none;
  stroke: var(--c-thread-on-dark);
  stroke-width: 2.6;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-dasharray: 1;
  stroke-dashoffset: 1;
  filter: drop-shadow(0 0 6px rgba(242, 96, 122, 0.5));
  animation: draw 2.6s cubic-bezier(0.55, 0.05, 0.3, 1) 0.35s forwards;
}

.pin__ring {
  fill: var(--c-indigo);
  stroke: var(--c-thread-on-dark);
  stroke-width: 1.5;
}
.pin__dot {
  fill: var(--c-thread-on-dark);
}
.pin__label {
  font-family: var(--f-body);
  font-size: 16px;
  font-weight: 500;
  fill: var(--c-on-indigo-mute);
}

.pin--to {
  opacity: 0;
  transform-box: fill-box;
  transform-origin: center;
  animation: arrive 0.6s ease-out 2.75s forwards;
}

@keyframes draw {
  to {
    stroke-dashoffset: 0;
  }
}
@keyframes arrive {
  from {
    opacity: 0;
    transform: translateY(6px);
  }
  to {
    opacity: 1;
    transform: none;
  }
}
</style>
