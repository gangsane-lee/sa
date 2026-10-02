<script setup>
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { DxButton } from 'devextreme-vue/button';
import { DxPopup } from 'devextreme-vue/popup';
import notify from 'devextreme/ui/notify';
import { confirm } from 'devextreme/ui/dialog';
import { api } from '@/api';
import { session, flash } from '@/stores/session';
import { APPLY_STATUS_MAP } from '@/constants/codes';
import { fmtDate } from '@/utils/format';
import SaLogo from '@/components/SaLogo.vue';
import ThreadScene from '@/components/ThreadScene.vue';
import StatusBadge from '@/components/StatusBadge.vue';

const router = useRouter();
const mine = ref(null);
const loading = ref(true);
const done = ref({ visible: false, kind: 'created' });

const statusMessage = computed(() => (mine.value ? APPLY_STATUS_MAP[mine.value.status]?.userText : ''));
const ticketNo = computed(() => (mine.value ? String(mine.value.id).padStart(4, '0') : ''));

onMounted(async () => {
  if (flash.applied) {
    done.value = { visible: true, kind: flash.applied };
    flash.applied = null;
  }
  try {
    mine.value = await api.application.getMine();
  } catch (e) {
    notify({ message: e.message, type: 'error', displayTime: 3500 });
  } finally {
    loading.value = false;
  }
});

const goApply = () => router.push({ name: 'apply' });

async function withdraw() {
  const ok = await confirm(
    '신청을 철회하면 작성한 정보가 <b>즉시 모두 삭제</b>되고 되돌릴 수 없어요.<br>진행 중인 매칭이 있다면 함께 취소돼요. 철회할까요?',
    '신청 철회',
  );
  if (!ok) return;
  try {
    await api.application.withdraw();
    mine.value = null;
    notify({ message: '신청을 철회했어요. 작성한 정보는 모두 삭제했어요.', type: 'success', displayTime: 3000 });
  } catch (e) {
    notify({ message: e.message, type: 'error', displayTime: 3500 });
  }
}
</script>

<template>
  <div class="home">
    <!-- 히어로: 달빛 아래 붉은 실 -->
    <section class="hero">
      <div class="container hero__grid">
        <div class="hero__copy">
          <p class="hero__eyebrow">
            <span class="hero__stamp">親展</span>
            {{ session.user.name }}님에게만 보이는 페이지예요
          </p>
          <h1 class="hero__title display">매일 스치던 그 사람이<br />오늘의 인연이 될지도 몰라요</h1>
          <p class="hero__lead">
            통근버스 옆자리, 구내식당 줄, 방진복 너머로 눈인사만 나누던 그 사람.
            사緣이 조용히, 그리고 안전하게 이어드릴게요.
          </p>

          <div v-if="loading" class="hero__cta hero__cta--loading" aria-busy="true">
            <span class="skeleton" />
          </div>

          <div v-else-if="!mine" class="hero__cta">
            <DxButton class="btn-xl" text="신청하기" type="default" @click="goApply" />
            <a href="#how" class="hero__link">어떻게 진행되나요?</a>
          </div>

          <div v-else class="ticket">
            <div class="ticket__head">
              <StatusBadge :status="mine.status" />
              <span class="ticket__no mono">No.{{ ticketNo }} · {{ fmtDate(mine.createdAt) }} 접수</span>
            </div>
            <p class="ticket__msg">{{ statusMessage }}</p>
            <div class="ticket__actions">
              <DxButton text="신청서 수정하기" type="default" @click="goApply" />
              <DxButton text="신청 철회" styling-mode="text" class="ticket__withdraw" @click="withdraw" />
            </div>
          </div>
        </div>

        <div class="hero__art">
          <ThreadScene />
        </div>
      </div>
    </section>

    <!-- 기밀 약속 -->
    <section class="vow" aria-labelledby="vow-title">
      <div class="container vow__grid">
        <div class="vow__head">
          <SaLogo mark :height="64" class="vow__seal" />
          <h2 id="vow-title" class="vow__title display">100% 기밀 보장</h2>
          <p class="vow__lead">
            사緣은 '누가 신청했는지'조차 비밀로 지켜요.
            마음을 여는 일이 부담이 되지 않도록, 처음부터 그렇게 설계했어요.
          </p>
        </div>
        <ul class="vow__list">
          <li>
            <h3>신청 사실은 본인과 담당자만 알아요</h3>
            <p>신청 여부와 프로필은 매칭 담당자만 볼 수 있어요. 팀장님도, 같은 그룹·파트 동료도 알 수 없어요.</p>
          </li>
          <li>
            <h3>서로 수락해야 전해져요</h3>
            <p>매칭 제안을 두 분 모두 수락했을 때만 이름·소속·연락처가 상대에게 전달돼요. 거절은 조용히, 흔적 없이 끝나요.</p>
          </li>
          <li>
            <h3>연락처는 암호화해 보관해요</h3>
            <p>이름·전화번호·이메일은 암호화해 저장하고, 담당자가 열람할 때마다 기록이 남아요.</p>
          </li>
          <li>
            <h3>철회하면 바로 지워요</h3>
            <p>언제든 신청을 철회할 수 있어요. 철회하는 즉시 작성한 정보가 모두 삭제돼요.</p>
          </li>
        </ul>
      </div>
    </section>

    <!-- 진행 방식: 실제 순서가 있는 절차라 번호를 붙인다 -->
    <section id="how" class="how" aria-labelledby="how-title">
      <div class="container">
        <h2 id="how-title" class="how__title display">인연이 닿기까지</h2>
        <ol class="how__steps">
          <li>
            <span class="how__dot">1</span>
            <h3>신청서 작성</h3>
            <p>5분이면 충분해요. 나를 소개하고, 만나고 싶은 사람을 알려주세요.</p>
          </li>
          <li>
            <span class="how__dot">2</span>
            <h3>담당자 매칭</h3>
            <p>매칭 담당자가 서로의 이상형과 근무지, 근무 형태까지 살펴 어울리는 분을 찾아요.</p>
          </li>
          <li>
            <span class="how__dot">3</span>
            <h3>서로 수락</h3>
            <p>두 분 모두 수락하면 연락처가 전달돼요. 한 분이라도 거절하면 없던 일이 돼요.</p>
          </li>
          <li>
            <span class="how__dot">4</span>
            <h3>첫 만남</h3>
            <p>점심 한 끼, 커피 한 잔부터 가볍게 시작해요.</p>
          </li>
        </ol>
      </div>
    </section>

    <section class="closing">
      <div class="container closing__inner">
        <template v-if="!mine">
          <p class="closing__line display">용기는 5분이면 충분해요</p>
          <DxButton class="btn-xl" text="신청하기" type="default" @click="goApply" />
          <p class="closing__note">상시 접수 · 마감 없음</p>
        </template>
        <p v-else class="closing__line display">좋은 소식이 닿으면 가장 먼저 알려드릴게요</p>
      </div>
    </section>

    <!-- 신청 완료 팝업 -->
    <DxPopup
      v-model:visible="done.visible"
      :width="440"
      max-width="calc(100vw - 32px)"
      height="auto"
      :show-title="false"
      :hide-on-outside-click="true"
      :wrapper-attr="{ class: 'sa-popup' }"
    >
      <div class="done">
        <SaLogo mark :height="72" class="done__seal" />
        <h2 class="done__title display">
          {{ done.kind === 'created' ? '신청이 접수되었어요' : '신청서를 수정했어요' }}
        </h2>
        <p v-if="done.kind === 'created'" class="done__body">
          두근거리는 마음, 사緣이 소중히 간직할게요.<br />
          어울리는 인연을 찾으면 남겨주신 연락처로 조용히 소식을 전해드릴게요.
        </p>
        <p v-else class="done__body">바뀐 내용으로 다시 어울리는 인연을 찾아볼게요.</p>
        <DxButton text="확인" type="default" width="100%" @click="done.visible = false" />
      </div>
    </DxPopup>
  </div>
</template>

<style scoped>
/* ── 히어로 ─────────────────────────── */
.hero {
  background: var(--c-indigo);
  color: var(--c-on-indigo);
  padding: clamp(40px, 7vw, 88px) 0 clamp(36px, 6vw, 72px);
}
.hero__grid {
  display: grid;
  grid-template-columns: minmax(0, 1.05fr) minmax(0, 0.95fr);
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
  font-size: clamp(32px, 4.4vw, 54px);
  line-height: 1.28;
  color: #fff;
}
.hero__lead {
  margin-top: 20px;
  max-width: 30em;
  font-size: clamp(15px, 1.4vw, 17px);
  color: var(--c-on-indigo-mute);
}
.hero__cta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px 24px;
  margin-top: 36px;
  min-height: 56px;
}
.hero__link {
  color: var(--c-on-indigo);
  font-size: 15px;
  text-underline-offset: 4px;
  text-decoration-color: rgba(233, 233, 246, 0.4);
}
.hero__link:hover {
  text-decoration-color: var(--c-thread-on-dark);
}
.skeleton {
  display: block;
  width: 180px;
  height: 52px;
  border-radius: var(--r-md);
  background: linear-gradient(90deg, rgba(255, 255, 255, 0.06), rgba(255, 255, 255, 0.14), rgba(255, 255, 255, 0.06));
  background-size: 200% 100%;
  animation: shimmer 1.4s linear infinite;
}
@keyframes shimmer {
  to {
    background-position: -200% 0;
  }
}

/* 접수증 */
.ticket {
  margin-top: 36px;
  max-width: 460px;
  padding: 18px 20px 14px;
  border-radius: var(--r-lg);
  background: var(--c-surface);
  color: var(--c-ink);
  box-shadow: var(--shadow-2);
  border-left: 4px solid var(--c-crimson);
}
.ticket__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}
.ticket__no {
  font-size: 12.5px;
  color: var(--c-mute);
}
.ticket__msg {
  margin-top: 10px;
  font-size: 15px;
}
.ticket__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 14px;
}
.ticket__withdraw :deep(.dx-button-text) {
  color: var(--c-mute);
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
  margin-top: 20px;
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
.vow__list h3 {
  font-size: 17px;
  color: var(--c-indigo);
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
.how__title {
  font-size: clamp(26px, 3vw, 34px);
  color: var(--c-indigo);
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
  top: 17px;
  left: 18px;
  right: 18px;
  height: 2px;
  background: var(--c-crimson);
  opacity: 0.35;
}
.how__steps li {
  position: relative;
}
.how__dot {
  display: inline-grid;
  place-items: center;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: var(--c-surface);
  border: 2px solid var(--c-crimson);
  color: var(--c-crimson-deep);
  font-family: var(--f-mono);
  font-weight: 500;
  position: relative;
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
  gap: 18px;
}
.closing__line {
  font-size: clamp(24px, 3vw, 32px);
  color: var(--c-indigo);
}
.closing__note {
  color: var(--c-mute);
  font-size: 13px;
}

/* 큰 버튼 */
.btn-xl {
  height: 52px;
  min-width: 180px;
  border-radius: var(--r-md);
}
.btn-xl :deep(.dx-button-text) {
  font-size: 16px;
  font-weight: 600;
  letter-spacing: 0.02em;
}

/* ── 완료 팝업 ─────────────────────── */
.done {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 14px;
  padding: 18px 8px 6px;
}
.done__seal {
  animation: stamp 0.55s cubic-bezier(0.2, 0.9, 0.3, 1.2) both;
}
.done__title {
  font-size: 24px;
  color: var(--c-indigo);
}
.done__body {
  color: var(--c-ink-2);
  margin-bottom: 8px;
}
@keyframes stamp {
  0% {
    opacity: 0;
    transform: scale(1.7) rotate(-14deg);
  }
  60% {
    opacity: 1;
    transform: scale(0.94) rotate(-5deg);
  }
  100% {
    transform: scale(1) rotate(-6deg);
  }
}

@media (max-width: 900px) {
  .hero__grid,
  .vow__grid {
    grid-template-columns: 1fr;
  }
  .hero__art {
    max-width: 460px;
    width: 100%;
    margin: 0 auto;
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
}
</style>
