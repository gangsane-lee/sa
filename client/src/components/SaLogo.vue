<script setup>
/**
 * 사緣 로고
 * - '사'는 한글, '緣(인연 연)'은 붉은 인장(印章) 안에 새겼다.
 *   인장은 '약속'이자 '봉인(기밀)'의 의미 — 인연을 맺되 비밀은 지킨다는 서비스의 두 축을 한 번에 담는다.
 * - 글리프는 SVG 패스로 내장해 폰트가 없는 환경에서도 똑같이 보인다.
 */
import { GLYPH_SA, GLYPH_YEON } from '@/assets/glyphs';

defineProps({
  height: { type: Number, default: 32 },
  /** true면 인장(緣)만 */
  mark: { type: Boolean, default: false },
  /** 어두운 배경 위에서는 'light' */
  tone: { type: String, default: 'ink' },
});

const SEAL = '#C8243F';
const PAPER = '#FFF6F7';
const yeonTransform = (cx, cy) => `translate(${cx} ${cy}) scale(0.66) translate(${-GLYPH_YEON.cx} ${-GLYPH_YEON.cy})`;
</script>

<template>
  <svg
    v-if="mark"
    class="sa-logo"
    :width="height"
    :height="height"
    viewBox="0 0 100 100"
    role="img"
    aria-label="사緣 인장"
  >
    <rect x="2" y="2" width="96" height="96" rx="14" :fill="SEAL" />
    <rect x="9" y="9" width="82" height="82" rx="9" fill="none" :stroke="PAPER" stroke-width="3" />
    <path :d="GLYPH_YEON.d" :fill="PAPER" :transform="yeonTransform(50, 50)" />
  </svg>

  <svg
    v-else
    class="sa-logo"
    :width="(height * 214) / 104"
    :height="height"
    viewBox="0 0 214 104"
    role="img"
    aria-label="사緣"
  >
    <path :d="GLYPH_SA.d" :fill="tone === 'light' ? '#F2F1FA' : '#22244A'" transform="translate(2 95)" />
    <g transform="rotate(-4 158 52)">
      <rect x="110" y="4" width="96" height="96" rx="13" :fill="SEAL" />
      <rect x="117" y="11" width="82" height="82" rx="8" fill="none" :stroke="PAPER" stroke-width="3" />
      <path :d="GLYPH_YEON.d" :fill="PAPER" :transform="yeonTransform(158, 52)" />
    </g>
  </svg>
</template>

<style scoped>
.sa-logo {
  display: block;
  flex: none;
}
</style>
