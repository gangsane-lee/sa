<script setup>
/**
 * '곧 매칭이 시작돼요' 팝업 — 관리자 설정에서 켜 두면 로그인한 뒤 한 번 보여준다(탭을 닫기 전까지 1회).
 * 참여 인원 같은 구체적인 숫자는 보여주지 않는다.
 */
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { DxPopup } from 'devextreme-vue/popup';
import { DxButton } from 'devextreme-vue/button';
import { api } from '@/api';

const KEY = 'sasystem.gathering.shown';
const router = useRouter();
const visible = ref(false);
const applied = ref(false);

onMounted(async () => {
  try {
    if (sessionStorage.getItem(KEY)) return;
  } catch {
    /* 저장소를 못 쓰면 매번 보여도 무방 */
  }
  try {
    const [g, mine] = await Promise.all([api.stats.gathering(), api.application.getMine().catch(() => null)]);
    if (!g?.show) return;
    applied.value = Boolean(mine);
    visible.value = true;
    try {
      sessionStorage.setItem(KEY, '1');
    } catch {
      /* noop */
    }
  } catch {
    /* 표시 실패는 조용히 넘어간다 */
  }
});

function go() {
  visible.value = false;
  if (!applied.value) router.push({ name: 'apply' });
}
</script>

<template>
  <DxPopup
    v-model:visible="visible"
    :width="440"
    max-width="calc(100vw - 32px)"
    height="auto"
    :show-title="false"
    :hide-on-outside-click="true"
    :wrapper-attr="{ class: 'sa-popup' }"
  >
    <div class="gp">
      <div class="gp__hearts" aria-hidden="true">
        <span>♥</span><span>♥</span><span>♥</span>
      </div>
      <p class="gp__eyebrow">두근두근, 곧 시작해요</p>
      <h2 class="display">인연이 충분히 모이면<br />첫 매칭이 시작돼요</h2>
      <div class="gp__bar" aria-hidden="true">
        <span><i>♥</i></span>
      </div>
      <p class="gp__count">사내 곳곳에서 설레는 마음들이 하나둘 모이고 있어요. <b>거의 다 왔어요!</b></p>
      <p class="gp__sub">
        {{ applied ? '신청해 두셨으니 문이 열리는 순간 가장 먼저 인연을 보내드릴게요.' : '지금 신청해 두면 문이 열리는 순간 가장 먼저 인연을 받아요. 같은 캠퍼스 누군가도 지금 이 화면을 보고 있을지 몰라요.' }}
      </p>
      <DxButton :text="applied ? '두근두근 기다릴게요' : '먼저 신청하고 기다리기'" type="default" width="100%" @click="go" />
      <DxButton v-if="!applied" text="조금 더 둘러볼게요" styling-mode="text" width="100%" @click="visible = false" />
    </div>
  </DxPopup>
</template>

<style scoped>
.gp {
  display: grid;
  justify-items: center;
  gap: 10px;
  padding: 10px 4px 2px;
  text-align: center;
}
.gp__hearts {
  display: flex;
  gap: 10px;
  color: var(--c-crimson);
  font-size: 26px;
}
.gp__hearts span {
  animation: beat 1.4s ease-in-out infinite;
}
.gp__hearts span:nth-child(2) {
  font-size: 36px;
  animation-delay: 0.2s;
}
.gp__hearts span:nth-child(3) {
  animation-delay: 0.4s;
}
.gp__eyebrow {
  color: var(--c-crimson-deep);
  font-weight: 700;
  font-size: 13px;
}
.gp h2 {
  font-size: 23px;
  color: var(--c-indigo);
}
.gp__bar {
  position: relative;
  width: 100%;
  height: 14px;
  margin-top: 6px;
  border-radius: 999px;
  background: var(--c-blush);
}
.gp__bar span {
  position: relative;
  display: block;
  height: 100%;
  border-radius: inherit;
  width: 82%;
  background: linear-gradient(90deg, #e2456a, var(--c-crimson));
  animation: fill 1.6s cubic-bezier(0.2, 0.8, 0.2, 1) both, swell 2.4s ease-in-out 1.6s infinite;
}
.gp__bar i {
  position: absolute;
  right: -9px;
  top: -9px;
  color: var(--c-crimson);
  font-style: normal;
  font-size: 22px;
  animation: beat 1.4s ease-in-out infinite;
}
.gp__count {
  color: var(--c-ink-2);
}
.gp__count b {
  color: var(--c-crimson-deep);
}
.gp__sub {
  color: var(--c-mute);
  font-size: 13.5px;
  margin-bottom: 4px;
}
@keyframes beat {
  0%, 100% { transform: scale(1); }
  15% { transform: scale(1.22); }
  30% { transform: scale(1); }
  45% { transform: scale(1.14); }
}
@keyframes fill {
  from { width: 0; }
}
@keyframes swell {
  0%, 100% { width: 82%; }
  50% { width: 86%; }
}
@media (prefers-reduced-motion: reduce) {
  .gp__hearts span,
  .gp__bar span,
  .gp__bar i {
    animation: none;
  }
}
</style>
