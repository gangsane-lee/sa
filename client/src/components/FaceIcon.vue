<script setup>
/**
 * 얼굴상 아이콘 — 후보 카드의 원형 아바타. 얼굴상 코드별 단순 선 그림(직접 그린 SVG).
 * 관리자가 기준정보에 새 얼굴상을 추가하면 그림이 없으므로 글자(fallback)로 보여준다.
 */
import { computed } from 'vue';

const props = defineProps({
  face: { type: String, default: '' },
  fallback: { type: String, default: '' },
  size: { type: Number, default: 56 },
});
const KNOWN = ['PUPPY', 'CAT', 'FOX', 'RABBIT', 'BEAR', 'DEER', 'DINO', 'TOFU', 'ARAB', 'WOLF'];
const known = computed(() => KNOWN.includes(props.face));
</script>

<template>
  <span class="fi" :style="{ width: `${size}px`, height: `${size}px` }" aria-hidden="true">
    <svg v-if="known" viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <!-- 강아지: 둥근 얼굴 + 늘어진 귀 -->
      <g v-if="face === 'PUPPY'">
        <circle cx="24" cy="26" r="11" />
        <path d="M14 18c-4 0-6 6-4 11 1 2 3 2 4 0M34 18c4 0 6 6 4 11-1 2-3 2-4 0" />
        <circle cx="20" cy="24" r="1" fill="currentColor" /><circle cx="28" cy="24" r="1" fill="currentColor" />
        <path d="M22.5 29h3l-1.5 1.5z" fill="currentColor" /><path d="M24 30.5v1.5M21.5 33c1.5 1 3.5 1 5 0" />
      </g>
      <!-- 고양이: 뾰족 귀 + 수염 -->
      <g v-else-if="face === 'CAT'">
        <path d="M13 22l1-10 7 6M35 22l-1-10-7 6" />
        <ellipse cx="24" cy="27" rx="12" ry="10" />
        <path d="M19 25.5c1-1 2-1 3 0M26 25.5c1-1 2-1 3 0" />
        <path d="M23 29h2l-1 1z" fill="currentColor" /><path d="M24 30v1M22 32c1 .8 3 .8 4 0" />
        <path d="M12 28l6 .5M12 31l6-.5M36 28l-6 .5M36 31l-6-.5" />
      </g>
      <!-- 여우: 삼각 얼굴 + 큰 귀 -->
      <g v-else-if="face === 'FOX'">
        <path d="M12 12l5 10M36 12l-5 10" /><path d="M12 12l8 5M36 12l-8 5" />
        <path d="M12 20c0 0 2 10 12 16 10-6 12-16 12-16-4-3-8-4-12-4s-8 1-12 4z" />
        <path d="M18 24l3 2M30 24l-3 2" /><circle cx="24" cy="32" r="1.4" fill="currentColor" />
      </g>
      <!-- 토끼: 긴 귀 -->
      <g v-else-if="face === 'RABBIT'">
        <path d="M19 19c-3-6-3-13 0-14s4 7 3 13M29 19c3-6 3-13 0-14s-4 7-3 13" />
        <circle cx="24" cy="29" r="10" />
        <circle cx="20.5" cy="27" r="1" fill="currentColor" /><circle cx="27.5" cy="27" r="1" fill="currentColor" />
        <path d="M23 31h2l-1 1z" fill="currentColor" /><path d="M22 34h4" />
      </g>
      <!-- 곰: 동그란 귀 + 주둥이 -->
      <g v-else-if="face === 'BEAR'">
        <circle cx="14.5" cy="15.5" r="4" /><circle cx="33.5" cy="15.5" r="4" />
        <circle cx="24" cy="26" r="12" />
        <circle cx="19.5" cy="23" r="1" fill="currentColor" /><circle cx="28.5" cy="23" r="1" fill="currentColor" />
        <ellipse cx="24" cy="29.5" rx="5" ry="4" /><path d="M22.5 28.5h3l-1.5 1.2z" fill="currentColor" />
      </g>
      <!-- 사슴: 작은 뿔 + 큰 눈 -->
      <g v-else-if="face === 'DEER'">
        <path d="M17 15l-2-7M16 11l-4-1M31 15l2-7M32 11l4-1" />
        <path d="M14 20l-4-2M34 20l4-2" />
        <path d="M15 20c0 10 4 16 9 16s9-6 9-16c-3-3-6-4-9-4s-6 1-9 4z" />
        <ellipse cx="20" cy="25" rx="1.4" ry="1.8" fill="currentColor" /><ellipse cx="28" cy="25" rx="1.4" ry="1.8" fill="currentColor" />
        <ellipse cx="24" cy="32" rx="2" ry="1.3" fill="currentColor" />
      </g>
      <!-- 공룡: 옆모습 + 등 가시 -->
      <g v-else-if="face === 'DINO'">
        <path d="M10 30c0-8 6-14 14-14h6c5 0 8 4 8 8v4c0 3-2 5-5 5H16c-3 0-6-1-6-3z" />
        <path d="M14 19l1-5 3 3M19 16l2-5 2 4M25 15l3-4 1 4" />
        <circle cx="31" cy="22" r="1.2" fill="currentColor" /><path d="M28 29h7M32 29v2M29 29v2" />
      </g>
      <!-- 두부: 말랑한 네모 얼굴 -->
      <g v-else-if="face === 'TOFU'">
        <rect x="11" y="13" width="26" height="24" rx="7" />
        <path d="M18 23v1.5M30 23v1.5" stroke-width="2.4" />
        <path d="M21 29c2 1.6 4 1.6 6 0" />
        <ellipse cx="15.5" cy="28" rx="1.8" ry="1" fill="currentColor" opacity=".45" stroke="none" />
        <ellipse cx="32.5" cy="28" rx="1.8" ry="1" fill="currentColor" opacity=".45" stroke="none" />
      </g>
      <!-- 아랍상: 짙은 눈썹·또렷한 이목구비 (사람 얼굴) -->
      <g v-else-if="face === 'ARAB'">
        <path d="M14 22c0-8 4-12 10-12s10 4 10 12c0 9-4 15-10 15s-10-6-10-15z" />
        <path d="M17 20.5c1.5-1.5 4-1.8 6-.6M31 20.5c-1.5-1.5-4-1.8-6-.6" stroke-width="2.8" />
        <circle cx="20" cy="24" r="1" fill="currentColor" /><circle cx="28" cy="24" r="1" fill="currentColor" />
        <path d="M24 24v5l-2 1M21.5 33c1.6.8 3.4.8 5 0" />
      </g>
      <!-- 늑대: 뾰족 귀 + 긴 주둥이 -->
      <g v-else-if="face === 'WOLF'">
        <path d="M13 21l2-11 6 7M35 21l-2-11-6 7" />
        <path d="M13 21c-1 6 2 12 7 14l4 3 4-3c5-2 8-8 7-14-3-3-7-4-11-4s-8 1-11 4z" />
        <path d="M18 24l3 1.5M30 24l-3 1.5" /><path d="M22 31h4l-2 2z" fill="currentColor" />
      </g>
    </svg>
    <span v-else class="fi__text display">{{ fallback }}</span>
  </span>
</template>

<style scoped>
.fi {
  flex: none;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: var(--c-indigo);
  color: #fff;
  box-shadow: inset 0 0 0 3px var(--c-thread-on-dark);
}
.fi svg {
  width: 72%;
  height: 72%;
}
.fi__text {
  font-size: 1.4em;
}
</style>
