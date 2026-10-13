<script setup>
/**
 * 히어로 일러스트 — 사원증 두 장이 목걸이 줄 하나로 엮인 모습.
 *  - 두 줄이 아래에서 X로 엇갈리며 올라가 하트를 이룬다: 하트의 반쪽씩이 두 사람의 사원증 줄이다
 *  - 목걸이 줄 = 인연의 붉은 실(紅絲). 사원증 = 사내 연애. 상대 사원증의 '?' = 소개팅(아직 모르는 사람)
 *  - 카드 아래 금색 칩은 반도체 회사의 사원증이라는 작은 표시
 * 움직임: 줄이 그려진 뒤 사원증이 한 번 흔들리고, '하트가 도착했어요' 알림이 뜬다 (움직임 줄이기 설정이면 생략)
 */
import { useId } from 'vue';

defineProps({
  me: { type: String, default: '평택캠퍼스' },
  them: { type: String, default: '기흥캠퍼스' },
  /** 알림 카드 표시 (로그인 화면처럼 좁은 곳에서는 끌 수 있다) */
  notice: { type: Boolean, default: true },
});

const uid = useId();
const shadowId = `badge-shadow-${uid}`;
const photoL = `photo-l-${uid}`;
const photoR = `photo-r-${uid}`;
const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** 왼쪽 사원증 줄: 왼쪽 카드 고리 → 하트 아래 끝에서 엇갈림 → 오른쪽 반쪽 → 하트 위 오목한 곳 */
const RIBBON_A =
  'M 190 262 C 222 232, 262 200, 280 178 C 300 158, 346 132, 346 98 C 346 72, 327 56, 306 56 C 292 56, 283 64, 280 76';
/** 오른쪽 사원증 줄 (좌우 대칭) */
const RIBBON_B =
  'M 370 262 C 338 232, 298 200, 280 178 C 260 158, 214 132, 214 98 C 214 72, 233 56, 254 56 C 268 56, 277 64, 280 76';

/** 바코드 막대 [x, 너비] */
const BARS = [[-26, 2], [-21, 1], [-17, 3], [-11, 1], [-7, 2], [-2, 1], [2, 3], [8, 1], [12, 2], [17, 1], [21, 3], [27, 2], [32, 1], [36, 2], [41, 3], [47, 1], [51, 2], [56, 1]];
</script>

<template>
  <svg class="bs" viewBox="0 0 560 530" role="img" :aria-label="`${me}의 당신과 ${them}의 누군가, 두 사원증이 하트 모양 목걸이 줄로 이어져 있어요`">
    <defs>
      <filter :id="shadowId" x="-30%" y="-20%" width="160%" height="160%">
        <feDropShadow dx="0" dy="12" stdDeviation="14" flood-color="#06103f" flood-opacity="0.38" />
      </filter>
      <clipPath :id="photoL"><rect x="-40" y="84" width="80" height="92" rx="10" /></clipPath>
      <clipPath :id="photoR"><rect x="-40" y="84" width="80" height="92" rx="10" /></clipPath>
    </defs>

    <!-- 목걸이 줄: 아래쪽 줄이 먼저, 위쪽 줄이 엇갈려 지나간다 -->
    <path :d="RIBBON_B" pathLength="1" class="ribbon ribbon--b" />
    <path :d="RIBBON_B" class="stitch" />
    <path :d="RIBBON_A" pathLength="1" class="ribbon ribbon--a" />
    <path :d="RIBBON_A" class="stitch" />

    <!-- 왼쪽: 나 -->
    <g transform="translate(190 262) rotate(-6)">
      <g>
        <animateTransform
          v-if="!reduce"
          attributeName="transform"
          type="rotate"
          values="-12;6;-3;1;0"
          keyTimes="0;0.35;0.62;0.82;1"
          dur="1.9s"
          begin="0.15s"
          fill="freeze"
          additive="sum"
        />
        <circle r="7" class="ring" />
        <rect x="-9" y="4" width="18" height="22" rx="4" class="clip" />
        <g :filter="`url(#${shadowId})`">
          <rect x="-78" y="24" width="156" height="232" rx="16" class="card" />
        </g>
        <path d="M -78 40 Q -78 24 -62 24 L 62 24 Q 78 24 78 40 L 78 70 L -78 70 Z" class="band" />
        <rect x="-17" y="31" width="34" height="7" rx="3.5" class="slot" />
        <text x="-62" y="60" class="band__text">DS · 임직원</text>
        <rect x="-40" y="84" width="80" height="92" rx="10" class="photo" />
        <g :clip-path="`url(#${photoL})`">
          <circle cx="0" cy="118" r="18" class="person" />
          <path d="M -36 178 C -36 148, 36 148, 36 178 Z" class="person" />
        </g>
        <text x="0" y="203" text-anchor="middle" class="name">당신</text>
        <text x="0" y="222" text-anchor="middle" class="site">{{ me }}</text>
        <rect x="-62" y="232" width="24" height="17" rx="3" class="chip" />
        <path d="M -62 240.5 h24 M -50 232 v17 M -56 236 h12 M -56 245 h12" class="chip__line" />
        <rect v-for="[x, w] in BARS" :key="`l${x}`" :x="x" y="233" :width="w" height="15" class="bar" />
      </g>
    </g>

    <!-- 오른쪽: 아직 모르는 그 사람 -->
    <g transform="translate(370 262) rotate(6)">
      <g>
        <animateTransform
          v-if="!reduce"
          attributeName="transform"
          type="rotate"
          values="12;-6;3;-1;0"
          keyTimes="0;0.35;0.62;0.82;1"
          dur="1.9s"
          begin="0.3s"
          fill="freeze"
          additive="sum"
        />
        <circle r="7" class="ring" />
        <rect x="-9" y="4" width="18" height="22" rx="4" class="clip" />
        <g :filter="`url(#${shadowId})`">
          <rect x="-78" y="24" width="156" height="232" rx="16" class="card" />
        </g>
        <path d="M -78 40 Q -78 24 -62 24 L 62 24 Q 78 24 78 40 L 78 70 L -78 70 Z" class="band" />
        <rect x="-17" y="31" width="34" height="7" rx="3.5" class="slot" />
        <text x="-62" y="60" class="band__text">DS · 임직원</text>
        <rect x="-40" y="84" width="80" height="92" rx="10" class="photo photo--secret" />
        <g :clip-path="`url(#${photoR})`">
          <circle cx="0" cy="118" r="18" class="person person--secret" />
          <path d="M -36 178 C -36 148, 36 148, 36 178 Z" class="person person--secret" />
        </g>
        <text x="0" y="128" text-anchor="middle" class="secret">?</text>
        <text x="0" y="203" text-anchor="middle" class="name name--secret">누구일까요</text>
        <text x="0" y="222" text-anchor="middle" class="site">{{ them }}</text>
        <rect x="-62" y="232" width="24" height="17" rx="3" class="chip" />
        <path d="M -62 240.5 h24 M -50 232 v17 M -56 236 h12 M -56 245 h12" class="chip__line" />
        <rect v-for="[x, w] in BARS" :key="`r${x}`" :x="x" y="233" :width="w" height="15" class="bar" />
      </g>
    </g>

    <!-- 알림: 소개팅 앱의 그 순간 -->
    <!-- 위치(transform 속성)와 등장 애니메이션(CSS transform)을 다른 g에 둔다 — 같은 g면 CSS가 위치를 덮어쓴다 -->
    <g v-if="notice" transform="translate(352 118)">
      <g class="notice">
        <g :filter="`url(#${shadowId})`">
          <rect width="204" height="58" rx="14" class="notice__card" />
        </g>
        <circle cx="29" cy="29" r="17" class="notice__dot" />
        <path d="M29 37 c-6-4.2-9.5-7.4-9.5-11 c0-2.6 2-4.4 4.4-4.4 c1.9 0 3.6 1.1 5.1 3 c1.5-1.9 3.2-3 5.1-3 c2.4 0 4.4 1.8 4.4 4.4 c0 3.6-3.5 6.8-9.5 11z" class="notice__heart" />
        <text x="54" y="26" class="notice__title">하트가 도착했어요</text>
        <text x="54" y="44" class="notice__sub">{{ them }} · 방금 전</text>
      </g>
    </g>
  </svg>
</template>

<style scoped>
.bs {
  display: block;
  width: 100%;
  height: auto;
  overflow: visible;
}

/* 목걸이 줄 — 납작한 끈 + 짜임 무늬 */
.ribbon {
  fill: none;
  stroke-width: 11;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-dasharray: 1;
  stroke-dashoffset: 1;
  animation: draw 1.6s cubic-bezier(0.55, 0.05, 0.3, 1) 0.45s forwards;
}
.ribbon--a {
  stroke: #ff8fa6;
}
.ribbon--b {
  stroke: #e8456a;
  animation-delay: 0.3s;
}
.stitch {
  fill: none;
  stroke: rgba(255, 255, 255, 0.6);
  stroke-width: 1.4;
  stroke-dasharray: 4 5;
  opacity: 0;
  animation: fade 0.6s ease 2s forwards;
}

.ring {
  fill: none;
  stroke: #c9d1e6;
  stroke-width: 3;
}
.clip {
  fill: #d6dceb;
  stroke: #aeb7cf;
  stroke-width: 1.2;
}
.card {
  fill: #fff;
}
.band {
  fill: #0b1b72;
}
.slot {
  fill: #050d3f;
}
.band__text {
  fill: #fff;
  font-family: var(--f-body);
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.04em;
}
.photo {
  fill: #e6ecfa;
}
.photo--secret {
  fill: #f1f4fc;
}
.person {
  fill: #a7b4d8;
}
.person--secret {
  fill: #d3daee;
}
.secret {
  fill: #e8456a;
  font-family: var(--f-body);
  font-size: 30px;
  font-weight: 700;
}
.name {
  fill: #121733;
  font-family: var(--f-body);
  font-size: 17px;
  font-weight: 700;
}
.name--secret {
  fill: #8a93b3;
  font-size: 15px;
}
.site {
  fill: #636b87;
  font-family: var(--f-body);
  font-size: 12px;
}
.chip {
  fill: #e5be5f;
}
.chip__line {
  fill: none;
  stroke: #b8902e;
  stroke-width: 0.8;
}
.bar {
  fill: #c3cbe0;
}

.notice {
  opacity: 0;
  transform-box: fill-box;
  transform-origin: center;
  animation: pop 0.55s cubic-bezier(0.2, 0.9, 0.3, 1.25) 2.2s forwards;
}
.notice__card {
  fill: #fff;
}
.notice__dot {
  fill: #fde4ea;
}
.notice__heart {
  fill: #e8456a;
}
.notice__title {
  fill: #121733;
  font-family: var(--f-body);
  font-size: 14px;
  font-weight: 700;
}
.notice__sub {
  fill: #636b87;
  font-family: var(--f-body);
  font-size: 11.5px;
}

@keyframes draw {
  to {
    stroke-dashoffset: 0;
  }
}
@keyframes fade {
  to {
    opacity: 1;
  }
}
@keyframes pop {
  from {
    opacity: 0;
    transform: translateY(10px) scale(0.92);
  }
  to {
    opacity: 1;
    transform: none;
  }
}
</style>
