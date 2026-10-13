<script setup>
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { api } from '@/api';
import { session } from '@/stores/session';
import { DAILY_CARD_LIMIT, DAILY_HEART_LIMIT } from '@/constants/codes';
import { ELEMENTS } from '@/utils/saju';
import SaLogo from '@/components/SaLogo.vue';
import BadgeScene from '@/components/BadgeScene.vue';
import FaceIcon from '@/components/FaceIcon.vue';
import MatchBoard from '@/components/MatchBoard.vue';

const router = useRouter();
const mine = ref(null);
const loading = ref(true);

onMounted(async () => {
  // 신청자는 홈에서 바로 매칭 보드를 본다. 신청 전이면 소개·신청 유도 화면
  mine.value = await api.application.getMine().catch(() => null);
  loading.value = false;
});

const goApply = () => router.push({ name: 'apply' });
const goSaju = () => router.push({ name: 'saju' });

/** 궁합 카드 장식용 오행 (실제 풀이는 사주 화면에서) */
const ELS = Object.values(ELEMENTS);
</script>

<template>
  <div class="home">
    <div v-if="loading" class="home__loading" aria-busy="true" />
    <!-- 신청자: 홈 = 매칭 보드 (오늘의 인연·받은 하트·매칭 상대) -->
    <MatchBoard v-else-if="mine" />

    <template v-else>
      <!-- 히어로: 하트로 엮인 두 사원증 -->
      <section class="hero">
        <div class="container hero__grid">
          <div class="hero__copy">
            <p class="hero__eyebrow">
              <span class="hero__stamp">親展</span>
              {{ session.user?.name }}님에게만 보이는 페이지예요
            </p>
            <h1 class="hero__title">매일 스치던 그 사람이<br />오늘의 인연이 될지도 몰라요</h1>
            <p class="hero__lead">
              통근버스 옆자리, 구내식당 줄, 방진복 너머로 눈인사만 나누던 그 사람.
              사緣이 조용히, 그리고 안전하게 이어드릴게요.
            </p>
            <div class="hero__cta">
              <button type="button" class="cta" @click="goApply">
                신청하기
                <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 17c-4.6-3.2-7.3-5.7-7.3-8.5C2.7 6.5 4.3 5 6.2 5c1.5 0 2.8.8 3.8 2.3C11 5.8 12.3 5 13.8 5c1.9 0 3.5 1.5 3.5 3.5 0 2.8-2.7 5.3-7.3 8.5z" /></svg>
              </button>
              <a href="#how" class="hero__link">어떻게 진행되나요?</a>
            </div>
            <ul class="hero__facts">
              <li>DS부문 임직원만</li>
              <li>하루 {{ DAILY_CARD_LIMIT }}명의 인연</li>
              <li>신청 사실은 비밀이에요</li>
            </ul>
          </div>
          <div class="hero__art">
            <BadgeScene />
          </div>
        </div>

        <!-- 캠퍼스 실루엣과 통근버스 정류장 -->
        <svg class="skyline" viewBox="0 0 1440 120" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
          <g class="skyline__bldg">
            <rect x="40" y="58" width="300" height="62" />
            <rect x="70" y="46" width="40" height="12" />
            <rect x="140" y="50" width="60" height="8" />
            <rect x="260" y="20" width="8" height="38" />
            <rect x="276" y="28" width="8" height="30" />
            <rect x="380" y="16" width="72" height="104" />
            <rect x="480" y="50" width="380" height="70" />
            <rect x="500" y="42" width="340" height="8" />
            <rect x="808" y="8" width="10" height="34" />
            <rect x="826" y="16" width="10" height="26" />
            <rect x="900" y="72" width="120" height="48" />
            <rect x="1060" y="56" width="330" height="64" />
            <rect x="1090" y="44" width="70" height="12" />
            <rect x="1300" y="22" width="9" height="34" />
          </g>
          <rect class="skyline__road" x="0" y="112" width="1440" height="8" />
          <g class="skyline__stop" transform="translate(232 82)">
            <rect x="0" y="0" width="2" height="30" />
            <rect x="-7" y="-6" width="16" height="10" rx="2" />
          </g>
          <g class="skyline__bus">
            <rect x="0" y="90" width="68" height="22" rx="5" class="bus__body" />
            <rect x="6" y="94" width="9" height="7" rx="1.5" class="bus__win" />
            <rect x="18" y="94" width="9" height="7" rx="1.5" class="bus__win" />
            <rect x="30" y="94" width="9" height="7" rx="1.5" class="bus__win" />
            <rect x="42" y="94" width="9" height="7" rx="1.5" class="bus__win" />
            <rect x="55" y="94" width="9" height="9" rx="1.5" class="bus__win" />
            <circle cx="15" cy="113" r="4" class="bus__wheel" />
            <circle cx="53" cy="113" r="4" class="bus__wheel" />
          </g>
        </svg>
      </section>

      <!-- 인연 사주 (마케팅) -->
      <section class="saju" aria-labelledby="saju-title">
        <div class="container saju__inner">
          <div class="saju__copy">
            <p class="eyebrow">NEW · 인연 사주</p>
            <h2 id="saju-title" class="h2">내 사주 속 붉은 실,<br />어느 캠퍼스로 이어져 있을까요?</h2>
            <p class="saju__lead">
              생년월일만 넣으면 나의 오행, 자꾸 끌리는 사람의 기운, 오늘의 연애운까지 풀어드려요.
              신청하지 않아도 볼 수 있어요.
            </p>
            <button type="button" class="cta cta--blue" @click="goSaju">무료로 내 인연 사주 보기</button>
          </div>

          <button type="button" class="compat" aria-label="인연 사주 보러 가기" @click="goSaju">
            <span class="compat__label">오늘의 사주 궁합</span>
            <span class="compat__pair">
              <span class="compat__face"><FaceIcon face="PUPPY" :size="62" /></span>
              <span class="compat__ring" style="--pct: 92">
                <b>92</b><small>점</small>
              </span>
              <span class="compat__face compat__face--b"><FaceIcon face="CAT" :size="62" /></span>
            </span>
            <span class="compat__line">물(水)이 나무(木)를 살려주는 사이예요</span>
            <span class="compat__elements" aria-hidden="true">
              <i v-for="e in ELS" :key="e.hanja" :style="{ '--el': e.color }">{{ e.hanja }}</i>
            </span>
          </button>
        </div>
      </section>

      <!-- 기밀 약속 — 문구는 실제 동작과 같게 유지할 것 (관리자 화면은 이름 전체를 보되, 볼 때마다 기록이 남는다) -->
      <section class="vow" aria-labelledby="vow-title">
        <div class="container vow__grid">
          <div class="vow__head">
            <SaLogo mark :height="60" class="vow__seal" />
            <h2 id="vow-title" class="h2 vow__title">100% 기밀 보장</h2>
            <p class="vow__lead">
              사緣은 '누가 신청했는지'조차 비밀로 지켜요.
              마음을 여는 일이 부담이 되지 않도록, 처음부터 그렇게 설계했어요.
            </p>
          </div>
          <ul class="vow__list">
            <li>
              <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="10" width="16" height="11" rx="2.5" /><path d="M8 10V7.5a4 4 0 0 1 8 0V10" /></svg>
              <h3>신청 사실은 본인과 담당자만 알아요</h3>
              <p>다른 신청자에게는 닉네임과 이름 초성만 담긴 카드가 보여요. 팀·건물·외모 정보는 다른 신청자에게 보여주지 않아요.</p>
            </li>
            <li>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20c-5.5-3.8-8.7-6.8-8.7-10.2C3.3 7.3 5.2 5.5 7.5 5.5c1.8 0 3.3 1 4.5 2.7 1.2-1.7 2.7-2.7 4.5-2.7 2.3 0 4.2 1.8 4.2 4.3 0 3.4-3.2 6.4-8.7 10.2z" /></svg>
              <h3>서로 마음을 확인해야 이어져요</h3>
              <p>하트를 주고받거나 담당자의 제안을 두 분 모두 수락했을 때만 쪽지함이 열려요. 응답하지 않은 하트는 상대에게 알리지 않고 조용히 끝나요.</p>
            </li>
            <li>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l7 3v5c0 4.6-3 8.4-7 10-4-1.6-7-5.4-7-10V6z" /><path d="M9 12l2 2 4-4" /></svg>
              <h3>열람할 때마다 기록이 남아요</h3>
              <p>이름은 암호화해 보관해요. 매칭 담당자가 신청서를 열람·수정·내려받을 때마다 기록이 남고, 그 기록은 고치거나 지울 수 없어요.</p>
            </li>
            <li>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4.5h6V7M6.5 7l1 13h9l1-13M10 11v6M14 11v6" /></svg>
              <h3>철회하면 바로 지워요</h3>
              <p>언제든 신청을 철회할 수 있어요. 철회하는 즉시 작성한 정보와 하트·쪽지 내역이 모두 삭제돼요.</p>
            </li>
          </ul>
        </div>
      </section>

      <!-- 진행 방식: 실제 순서가 있는 절차라 번호를 붙인다 -->
      <section id="how" class="how" aria-labelledby="how-title">
        <div class="container">
          <h2 id="how-title" class="h2">인연이 닿기까지</h2>
          <ol class="how__steps">
            <li>
              <span class="how__icon">
                <svg viewBox="0 0 28 28" aria-hidden="true"><rect x="6" y="4.5" width="16" height="20" rx="2.5" /><path d="M10.5 4.5V3h7v1.5M10 11h8M10 15h8M10 19h5" /></svg>
                <span class="how__no">1</span>
              </span>
              <h3>신청서 작성</h3>
              <p>5분이면 충분해요. 나를 소개하고, 선호와 우선순위를 알려주세요.</p>
            </li>
            <li>
              <span class="how__icon">
                <svg viewBox="0 0 28 28" aria-hidden="true"><rect x="9" y="5" width="14" height="19" rx="2.5" /><path d="M6 8.5v13.5a2.5 2.5 0 0 0 2.5 2.5H18" /><path d="M16 17.5c-2.3-1.6-3.5-2.8-3.5-4.2 0-1 .8-1.8 1.8-1.8.7 0 1.3.4 1.7 1 .4-.6 1-1 1.7-1 1 0 1.8.8 1.8 1.8 0 1.4-1.2 2.6-3.5 4.2z" /></svg>
                <span class="how__no">2</span>
              </span>
              <h3>매일 {{ DAILY_CARD_LIMIT }}명의 후보</h3>
              <p>서로의 선호가 잘 맞는 분을 매일 {{ DAILY_CARD_LIMIT }}명씩 보내드려요. 한 명씩 넘겨보세요.</p>
            </li>
            <li>
              <span class="how__icon">
                <svg viewBox="0 0 28 28" aria-hidden="true"><path d="M14 23c-6.2-4.3-9.8-7.7-9.8-11.5 0-2.9 2.2-5 4.8-5 2 0 3.7 1.1 5 3 1.3-1.9 3-3 5-3 2.6 0 4.8 2.1 4.8 5 0 3.8-3.6 7.2-9.8 11.5z" /></svg>
                <span class="how__no">3</span>
              </span>
              <h3>하트 {{ DAILY_HEART_LIMIT }}개</h3>
              <p>마음에 드는 분께 하루 {{ DAILY_HEART_LIMIT }}개의 하트를 남겨요. 상대도 나에게 하트를 보내면 매칭 중이 돼요.</p>
            </li>
            <li>
              <span class="how__icon">
                <svg viewBox="0 0 28 28" aria-hidden="true"><path d="M5 13h13v5.5a4.5 4.5 0 0 1-4.5 4.5h-4A4.5 4.5 0 0 1 5 18.5z" /><path d="M18 14.5h1.8a2.4 2.4 0 0 1 0 4.8H18" /><path d="M11.5 10c-1.8-1.2-2.8-2.1-2.8-3.2 0-.9.7-1.5 1.4-1.5.6 0 1.1.4 1.4.9.3-.5.8-.9 1.4-.9.8 0 1.4.6 1.4 1.5 0 1.1-1 2-2.8 3.2z" /></svg>
                <span class="how__no">4</span>
              </span>
              <h3>첫 만남</h3>
              <p>구내식당 점심 한 끼, 사내 카페 커피 한 잔부터 가볍게 시작해요.</p>
            </li>
          </ol>
        </div>
      </section>

      <section class="closing">
        <div class="container closing__inner">
          <svg class="cups" viewBox="0 0 180 120" aria-hidden="true">
            <path class="cups__steam" d="M90 38c-9-6.2-14-11-14-16.6 0-4.3 3.2-7.4 7-7.4 2.9 0 5.3 1.6 7 4.3 1.7-2.7 4.1-4.3 7-4.3 3.8 0 7 3.1 7 7.4 0 5.6-5 10.4-14 16.6z" />
            <g transform="rotate(-12 62 84)">
              <path class="cups__cup" d="M40 52h42v38a12 12 0 0 1-12 12H52a12 12 0 0 1-12-12z" />
              <path class="cups__band" d="M40 66h42v9H40z" />
              <path class="cups__handle" d="M40 62h-6a8 8 0 0 0 0 16h6" />
            </g>
            <g transform="rotate(12 118 84)">
              <path class="cups__cup" d="M98 52h42v38a12 12 0 0 1-12 12h-18a12 12 0 0 1-12-12z" />
              <path class="cups__band" d="M98 66h42v9H98z" />
              <path class="cups__handle" d="M140 62h6a8 8 0 0 1 0 16h-6" />
            </g>
          </svg>
          <p class="closing__line">용기는 5분이면 충분해요</p>
          <button type="button" class="cta cta--blue" @click="goApply">신청하기</button>
          <p class="closing__note">상시 접수 · 마감 없음</p>
        </div>
      </section>
    </template>
  </div>
</template>

<style scoped>
.home__loading {
  min-height: 70vh;
}

/* 회사 쪽 목소리(제목)는 산세리프로 단단하게 */
.h2 {
  font-family: var(--f-body);
  font-weight: 700;
  font-size: clamp(26px, 3vw, 36px);
  line-height: 1.3;
  letter-spacing: -0.02em;
  color: var(--c-ink);
}
.eyebrow {
  color: var(--c-crimson-deep);
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.06em;
}

/* 주요 버튼 — 파란 바탕 위에서는 흰 버튼, 흰 바탕 위에서는 파란 버튼 */
.cta {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  height: 52px;
  padding: 0 26px;
  border: 0;
  border-radius: 999px;
  background: #fff;
  color: var(--c-indigo);
  font: inherit;
  font-size: 16px;
  font-weight: 700;
  cursor: pointer;
  box-shadow: 0 10px 24px rgba(5, 13, 63, 0.28);
  transition: transform 0.15s ease, box-shadow 0.15s ease;
}
.cta svg {
  width: 18px;
  height: 18px;
  fill: #e8456a;
}
.cta:hover {
  transform: translateY(-2px);
  box-shadow: 0 14px 30px rgba(5, 13, 63, 0.34);
}
.cta:focus-visible {
  outline: 3px solid #ffd2dc;
  outline-offset: 3px;
}
.cta--blue {
  background: var(--c-indigo);
  color: #fff;
  box-shadow: 0 10px 24px rgba(20, 40, 160, 0.25);
}
.cta--blue:focus-visible {
  outline-color: var(--c-crimson);
}

/* ── 히어로 ─────────────────────────── */
.hero {
  position: relative;
  overflow: hidden;
  background:
    radial-gradient(60% 70% at 78% 40%, rgba(64, 98, 235, 0.55) 0%, transparent 70%),
    var(--c-indigo);
  color: var(--c-on-indigo);
  padding: clamp(40px, 6vw, 80px) 0 clamp(96px, 10vw, 140px);
}
.hero__grid {
  position: relative;
  z-index: 1;
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 0.95fr);
  align-items: center;
  gap: clamp(24px, 4vw, 56px);
}
.hero__eyebrow {
  display: flex;
  align-items: center;
  gap: 10px;
  color: var(--c-on-indigo-mute);
  font-size: 14px;
}
.hero__stamp {
  display: inline-grid;
  place-items: center;
  padding: 3px 7px;
  border: 1.5px solid var(--c-thread-on-dark);
  border-radius: 4px;
  color: var(--c-thread-on-dark);
  font-family: var(--f-display);
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.08em;
  transform: rotate(-3deg);
}
.hero__title {
  margin-top: 20px;
  font-family: var(--f-body);
  font-weight: 700;
  font-size: clamp(32px, 3.5vw, 50px);
  line-height: 1.24;
  letter-spacing: -0.03em;
  color: #fff;
}
.hero__lead {
  margin-top: 20px;
  max-width: 30em;
  font-size: clamp(15px, 1.35vw, 17px);
  color: var(--c-on-indigo-mute);
}
.hero__cta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 14px 26px;
  margin-top: 34px;
}
.hero__link {
  color: var(--c-on-indigo);
  font-size: 15px;
  text-underline-offset: 4px;
  text-decoration-color: rgba(240, 243, 255, 0.4);
}
.hero__link:hover {
  text-decoration-color: var(--c-thread-on-dark);
}
.hero__facts {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 10px;
  margin: 28px 0 0;
  padding: 0;
  list-style: none;
  color: var(--c-on-indigo-mute);
  font-size: 13.5px;
}
.hero__facts li {
  display: inline-flex;
  align-items: center;
  gap: 10px;
}
.hero__facts li + li::before {
  content: '';
  width: 3px;
  height: 3px;
  border-radius: 50%;
  background: currentColor;
  opacity: 0.6;
}
.hero__art {
  max-width: 560px;
  width: 100%;
  justify-self: center;
}

/* 캠퍼스 실루엣 */
.skyline {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  width: 100%;
  height: clamp(70px, 8vw, 120px);
}
.skyline__bldg rect {
  fill: rgba(255, 255, 255, 0.07);
}
.skyline__road {
  fill: rgba(255, 255, 255, 0.06);
}
.skyline__stop rect {
  fill: rgba(255, 255, 255, 0.35);
}
.bus__body {
  fill: rgba(255, 255, 255, 0.92);
}
.bus__win {
  fill: rgba(20, 40, 160, 0.55);
}
.bus__wheel {
  fill: #0b1b72;
}
.skyline__bus {
  transform: translateX(150px);
  animation: bus 3.2s cubic-bezier(0.2, 0.7, 0.3, 1) 0.4s both;
}
@keyframes bus {
  from {
    transform: translateX(-90px);
  }
  to {
    transform: translateX(150px);
  }
}

/* ── 인연 사주 ─────────────────────── */
.saju {
  padding: clamp(56px, 7vw, 96px) 0;
  background:
    radial-gradient(60% 80% at 92% 30%, var(--c-blush) 0%, transparent 62%),
    var(--c-blush-soft);
  border-bottom: 1px solid var(--c-line);
}
.saju__inner {
  display: grid;
  grid-template-columns: minmax(0, 1.1fr) minmax(0, 0.9fr);
  gap: clamp(28px, 5vw, 72px);
  align-items: center;
}
.saju__copy .h2 {
  margin-top: 12px;
}
.saju__lead {
  margin: 14px 0 28px;
  max-width: 30em;
  color: var(--c-ink-2);
}

/* 궁합 카드 — 소개팅 앱 화면 한 장처럼 */
.compat {
  justify-self: center;
  display: grid;
  justify-items: center;
  gap: 14px;
  width: min(100%, 380px);
  padding: 26px 24px 22px;
  border: 0;
  border-radius: 24px;
  background: var(--c-surface);
  box-shadow: var(--shadow-2);
  font: inherit;
  color: var(--c-ink);
  cursor: pointer;
  transform: rotate(1.5deg);
  transition: transform 0.2s ease;
}
.compat:hover {
  transform: rotate(0deg) translateY(-3px);
}
.compat:focus-visible {
  outline: 3px solid var(--c-crimson);
  outline-offset: 4px;
}
.compat__label {
  padding: 3px 12px;
  border-radius: 999px;
  background: #eef1fc;
  color: var(--c-indigo);
  font-size: 12.5px;
  font-weight: 700;
}
.compat__pair {
  display: flex;
  align-items: center;
  gap: 12px;
}
.compat__face {
  display: grid;
  place-items: center;
  width: 86px;
  height: 86px;
  border-radius: 50%;
  background: #eef1fc;
  color: var(--c-indigo);
}
.compat__face--b {
  background: var(--c-blush);
  color: var(--c-crimson-deep);
}
.compat__ring {
  display: flex;
  align-items: baseline;
  justify-content: center;
  gap: 1px;
  padding-top: 25px;
  width: 78px;
  height: 78px;
  border-radius: 50%;
  background:
    radial-gradient(closest-side, #fff 78%, transparent 80%),
    conic-gradient(var(--c-crimson) calc(var(--pct) * 1%), var(--c-blush) 0);
}
.compat__ring b {
  font-size: 26px;
  font-weight: 700;
  color: var(--c-crimson-deep);
  line-height: 1;
}
.compat__ring small {
  font-size: 12px;
  color: var(--c-mute);
}
.compat__line {
  font-size: 14.5px;
  font-weight: 600;
  color: var(--c-ink-2);
}
.compat__elements {
  display: flex;
  gap: 8px;
}
.compat__elements i {
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  border-radius: 10px;
  background: color-mix(in srgb, var(--el) 12%, white);
  color: var(--el);
  font-family: var(--f-display);
  font-style: normal;
  font-weight: 700;
  font-size: 17px;
}

/* ── 기밀 약속 ─────────────────────── */
.vow {
  padding: clamp(56px, 8vw, 104px) 0;
}
.vow__grid {
  display: grid;
  grid-template-columns: minmax(0, 0.8fr) minmax(0, 1.2fr);
  gap: clamp(28px, 5vw, 72px);
  align-items: start;
}
.vow__seal {
  transform: rotate(-6deg);
}
.vow__title {
  margin-top: 18px;
  font-size: clamp(30px, 3.4vw, 42px);
  color: var(--c-indigo);
}
.vow__lead {
  margin-top: 14px;
  color: var(--c-ink-2);
  font-size: 16px;
}
.vow__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1px;
  background: var(--c-line);
  border: 1px solid var(--c-line);
  border-radius: var(--r-lg);
  overflow: hidden;
}
.vow__list li {
  padding: 24px 24px 26px;
  background: var(--c-surface);
}
.vow__list svg {
  width: 26px;
  height: 26px;
  fill: none;
  stroke: var(--c-indigo);
  stroke-width: 1.7;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.vow__list h3 {
  margin-top: 12px;
  font-size: 17px;
  color: var(--c-ink);
}
.vow__list p {
  margin-top: 8px;
  color: var(--c-ink-2);
  font-size: 14.5px;
}

/* ── 진행 방식 ─────────────────────── */
.how {
  padding: clamp(48px, 7vw, 88px) 0;
  background: var(--c-surface);
  border-top: 1px solid var(--c-line);
  border-bottom: 1px solid var(--c-line);
}
.how__steps {
  position: relative;
  list-style: none;
  margin: 40px 0 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 28px;
}
/* 단계를 잇는 붉은 실 */
.how__steps::before {
  content: '';
  position: absolute;
  top: 27px;
  left: 28px;
  right: 28px;
  height: 2px;
  background: repeating-linear-gradient(90deg, var(--c-crimson) 0 8px, transparent 8px 14px);
  opacity: 0.45;
}
.how__steps li {
  position: relative;
}
.how__icon {
  position: relative;
  display: inline-grid;
  place-items: center;
  width: 56px;
  height: 56px;
  border-radius: 18px;
  background: #eef1fc;
}
.how__icon svg {
  width: 28px;
  height: 28px;
  fill: none;
  stroke: var(--c-indigo);
  stroke-width: 1.7;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.how__no {
  position: absolute;
  top: -6px;
  right: -6px;
  display: grid;
  place-items: center;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: var(--c-crimson);
  color: #fff;
  font-family: var(--f-mono);
  font-size: 12px;
  font-weight: 500;
}
.how__steps h3 {
  margin-top: 16px;
  font-size: 17px;
}
.how__steps p {
  margin-top: 6px;
  color: var(--c-ink-2);
  font-size: 14.5px;
}

/* ── 마무리 ────────────────────────── */
.closing {
  padding: clamp(56px, 8vw, 96px) 0;
}
.closing__inner {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 16px;
}
.cups {
  width: 168px;
  height: auto;
}
.cups__cup {
  fill: #fff;
  stroke: var(--c-indigo);
  stroke-width: 3;
  stroke-linejoin: round;
}
.cups__band {
  fill: var(--c-indigo);
}
.cups__handle {
  fill: none;
  stroke: var(--c-indigo);
  stroke-width: 3;
}
.cups__steam {
  fill: #ff8fa6;
  transform-box: fill-box;
  transform-origin: center bottom;
  animation: beat 1.8s ease-in-out infinite;
}
@keyframes beat {
  0%,
  100% {
    transform: scale(1);
  }
  12% {
    transform: scale(1.12);
  }
  24% {
    transform: scale(1);
  }
}
.closing__line {
  font-family: var(--f-display);
  font-weight: 700;
  font-size: clamp(24px, 3vw, 32px);
  color: var(--c-indigo);
}
.closing__note {
  color: var(--c-mute);
  font-size: 13px;
}

@media (max-width: 900px) {
  .hero__grid,
  .saju__inner,
  .vow__grid {
    grid-template-columns: 1fr;
  }
  .hero__art {
    max-width: 440px;
  }
  .how__steps {
    grid-template-columns: 1fr 1fr;
  }
  .how__steps::before {
    display: none;
  }
}
@media (max-width: 560px) {
  .vow__list,
  .how__steps {
    grid-template-columns: 1fr;
  }
  /* 좁은 화면에서는 줄바꿈된 줄 앞에 점이 붙지 않게 세로로 */
  .hero__facts {
    flex-direction: column;
    gap: 4px;
  }
  .hero__facts li + li::before {
    display: none;
  }
  .compat__face {
    width: 70px;
    height: 70px;
  }
}
</style>
