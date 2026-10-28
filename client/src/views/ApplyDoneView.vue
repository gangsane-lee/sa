<script setup>
/** 신청 완료 결과 화면 — 상태는 여기와 마이페이지에서만 보여준다 */
import { ref, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { DxButton } from 'devextreme-vue/button';
import { api } from '@/api';
import { DAILY_CARD_LIMIT, DAILY_HEART_LIMIT, USER_STATUS_MAP } from '@shared/constants/codes';
import { fmtDate } from '@shared/utils/format';
import SaLogo from '@/components/SaLogo.vue';
import UserStatusBadge from '@/components/UserStatusBadge.vue';

const router = useRouter();
/**
 * 인연 사주에서 왔으면: 신청과 함께 하트를 보냈는지(heart = 받은 사람 닉네임, matched = 바로 매칭) 보여준다.
 * 하트를 못 보냈으면 사주 인연에게 하트를 보내러 가는 버튼을 먼저 보여준다
 */
const q = useRoute().query;
const fromSaju = q.from === 'saju';
const heartTo = typeof q.heart === 'string' ? q.heart : '';
const matched = q.matched === '1';
const mine = ref(null);

onMounted(async () => {
  mine.value = await api.application.getMine().catch(() => null);
  if (!mine.value) router.replace({ name: 'apply' });
});
</script>

<template>
  <div class="done">
    <div class="container done__inner">
      <div v-if="mine" class="sheet">
        <SaLogo mark :height="76" class="sheet__seal" />
        <p class="sheet__eyebrow mono">No.{{ String(mine.id).padStart(4, '0') }} · {{ fmtDate(mine.createdAt) }} 접수</p>
        <h1 class="sheet__title display">신청이 완료되었어요</h1>
        <p class="sheet__body">두근거리는 마음, 사緣이 소중히 간직할게요.</p>
        <p v-if="heartTo" class="heart" role="status">
          <span aria-hidden="true">♥</span>
          <template v-if="matched"><b>{{ heartTo }}</b>님도 이미 하트를 보냈었어요. <b>바로 매칭됐어요!</b> 쪽지함에서 인사를 나눠 보세요.</template>
          <template v-else><b>{{ heartTo }}</b>님에게 하트를 보냈어요. 상대도 하트를 보내면 바로 매칭돼요.</template>
        </p>

        <div class="state">
          <span class="state__label">지금 상태</span>
          <UserStatusBadge :status="mine.userStatus" large />
          <p class="state__msg">{{ USER_STATUS_MAP[mine.userStatus]?.userText }}</p>
        </div>

        <ol class="next">
          <li><b>매일 {{ DAILY_CARD_LIMIT }}명</b>의 후보가 마이페이지에 도착해요. 한 명씩 넘겨보세요.</li>
          <li>마음에 드는 분께 <b>하루 {{ DAILY_HEART_LIMIT }}개</b>의 하트를 남길 수 있어요. 한 번 본 분은 30일 동안 다시 추천되지 않아요.</li>
          <li>상대도 나에게 하트를 보내면 <b>매칭 중</b>이 되고, 쪽지함에서 바로 인사를 나눌 수 있어요.</li>
        </ol>

        <div class="actions">
          <DxButton
            v-if="matched"
            text="쪽지함에서 인사하기"
            type="default"
            class="actions__main"
            @click="router.push({ name: 'messages' })"
          />
          <DxButton
            v-if="fromSaju && !heartTo"
            text="사주 인연에게 하트 보내러 가기 ♥"
            type="default"
            class="actions__main"
            @click="router.push({ name: 'saju' })"
          />
          <DxButton
            text="홈에서 오늘의 인연 보기"
            :type="(fromSaju && !heartTo) || matched ? 'normal' : 'default'"
            :styling-mode="(fromSaju && !heartTo) || matched ? 'outlined' : 'contained'"
            class="actions__main"
            @click="router.push({ name: 'home' })"
          />
          <DxButton text="마이페이지 · 신청서 보기" styling-mode="outlined" @click="router.push({ name: 'mypage' })" />
        </div>
        <p class="note">신청 상태와 오늘의 인연은 홈 화면에서, 신청서는 마이페이지에서 볼 수 있어요. 다른 사람에게는 보이지 않아요.</p>
      </div>
      <div v-else class="sheet sheet--loading" aria-busy="true" />
    </div>
  </div>
</template>

<style scoped>
.heart {
  margin-top: 14px;
  padding: 12px 16px;
  border-radius: var(--r-md);
  background: var(--c-blush-soft);
  color: var(--c-ink-2);
  text-align: left;
}
.heart span {
  color: var(--c-crimson);
  margin-right: 4px;
}
.heart b {
  color: var(--c-crimson-deep);
}
.done {
  padding: clamp(32px, 6vw, 72px) 0 80px;
}
.done__inner {
  display: flex;
  justify-content: center;
}
.sheet {
  width: 100%;
  max-width: 600px;
  padding: clamp(24px, 5vw, 48px);
  background: var(--c-surface);
  border: 1px solid var(--c-line);
  border-radius: var(--r-lg);
  box-shadow: var(--shadow-1);
  text-align: center;
}
.sheet--loading {
  min-height: 420px;
}
.sheet__seal {
  animation: stamp 0.55s cubic-bezier(0.2, 0.9, 0.3, 1.2) both;
}
.sheet__eyebrow {
  margin-top: 18px;
  color: var(--c-mute);
  font-size: 12.5px;
}
.sheet__title {
  margin-top: 6px;
  font-size: clamp(26px, 3.2vw, 34px);
  color: var(--c-indigo);
}
.sheet__body {
  margin-top: 8px;
  color: var(--c-ink-2);
}
.state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  margin: 26px 0 8px;
  padding: 18px;
  border-radius: var(--r-md);
  background: var(--c-blush-soft);
}
.state__label {
  color: var(--c-mute);
  font-size: 13px;
}
.state__msg {
  color: var(--c-ink-2);
  font-size: 14.5px;
}
.next {
  margin: 22px 0 0;
  padding-left: 1.4em;
  text-align: left;
  color: var(--c-ink-2);
  font-size: 14.5px;
  display: grid;
  gap: 8px;
}
.next b {
  color: var(--c-crimson-deep);
}
.actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 10px;
  margin-top: 28px;
}
.actions :deep(.dx-button) {
  height: 48px;
}
.actions__main :deep(.dx-button-text) {
  font-weight: 600;
}
.note {
  margin-top: 16px;
  color: var(--c-mute);
  font-size: 12.5px;
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
</style>
