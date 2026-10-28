<script setup>
/**
 * 매칭 보드 (신청자의 홈 화면) — 내 상태, 오늘의 인연(하루 3명·하트 1개), 나에게 온 하트, 매칭 상대·후기
 * 후보는 한 명씩만 내려온다. 넘긴 후보는 서버가 다시 보여주지 않으므로 되돌아갈 수 없다.
 * 하트를 보내면 상대가 답하거나 72시간이 지날 때까지 다음 후보를 볼 수 없다(블락).
 */
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue';
import { useRouter } from 'vue-router';
import { DxButton } from 'devextreme-vue/button';
import { DxPopup } from 'devextreme-vue/popup';
import notify from 'devextreme/ui/notify';
import { confirm } from 'devextreme/ui/dialog';
import { api, isMock } from '@/api';
import { flash, refreshUser } from '@/stores/session';
import { DAILY_CARD_LIMIT, DAILY_HEART_LIMIT, USER_STATUS_MAP, REVIEW_OUTCOMES } from '@shared/constants/codes';
import { fmtDate, fmtDateTime } from '@shared/utils/format';
import SaLogo from '@/components/SaLogo.vue';
import ProfileCard from '@/components/ProfileCard.vue';
import UserStatusBadge from '@/components/UserStatusBadge.vue';
import ReviewForm from '@/components/ReviewForm.vue';
import GunghapPanel from '@/components/GunghapPanel.vue';
import FaceIcon from '@/components/FaceIcon.vue';

const router = useRouter();
const dash = ref(null);
const noApp = ref(false);
const busy = ref(false);
const flying = ref(false);
const celebrate = ref(false);
const celebrateKind = ref('match'); // match | couple
const LOCK_TEXT = {
  MATCHING: '매칭 중에는 신청서를 고칠 수 없어요. 매칭 대기 중이 되면 다시 열려요.',
  HEART: '보낸 하트에 답이 올 때까지 신청서를 고칠 수 없어요.',
  COUPLED: '커플 완료 상태라 신청서가 잠겨 있어요.',
};
const editingReview = ref(false);
const inboxSel = ref(0);
const inboxItem = computed(() => dash.value?.inbox?.[Math.min(inboxSel.value, (dash.value?.inbox?.length ?? 1) - 1)] ?? null);
watch(
  () => dash.value?.inbox?.length,
  (n) => {
    if (inboxSel.value >= (n ?? 0)) inboxSel.value = Math.max(0, (n ?? 1) - 1);
  },
);
const emit = defineEmits(['loaded']);
const now = ref(Date.now());
let timer;

const daily = computed(() => dash.value?.daily);
const app = computed(() => dash.value?.application);
const progressText = computed(() => {
  const d = daily.value;
  if (!d?.total) return '';
  return `${Math.min(d.index + 1, d.total)} / ${d.total}`;
});
/** 다음 후보 도착까지 (KST 자정) */
const untilTomorrow = computed(() => {
  const kstNow = now.value + 9 * 3600000;
  const left = 86400000 - (kstNow % 86400000);
  const h = Math.floor(left / 3600000);
  const m = Math.floor((left % 3600000) / 60000);
  return `${h}시간 ${m}분`;
});

async function load() {
  try {
    dash.value = await api.me.dashboard();
    emit('loaded', dash.value);
  } catch (e) {
    if (e.status === 404) noApp.value = true;
    else notify({ message: e.message, type: 'error', displayTime: 3500 });
  }
}

onMounted(async () => {
  await load();
  timer = setInterval(() => (now.value = Date.now()), 30000);
});
onBeforeUnmount(() => clearInterval(timer));

async function run(fn) {
  busy.value = true;
  try {
    const r = await fn();
    dash.value = r;
    refreshUser(); // 헤더의 신청 상태 표시도 함께 갱신
    return r;
  } catch (e) {
    notify({ message: e.message, type: e.status === 429 ? 'warning' : 'error', displayTime: 3500 });
    await load();
    return null;
  } finally {
    busy.value = false;
  }
}

function openMatchCelebrate() {
  celebrateKind.value = 'match';
  celebrate.value = true;
}

async function pass() {
  const ok = await confirm('넘기면 이 분은 <b>30일 동안 다시 볼 수 없어요.</b> 다음 후보로 넘길까요?', '다음 후보');
  if (ok) await run(() => api.me.pass());
}

async function heart() {
  const ok = await confirm(
    `하트는 하루 ${DAILY_HEART_LIMIT}개만 보낼 수 있어요.<br><b>${daily.value.current.nickname}</b>님에게 하트를 보낼까요?<br><small>상대에게는 '누군가 하트를 보냈다'는 알림과 내 간략 카드만 전해져요.</small>`,
    '하트 보내기',
  );
  if (!ok) return;
  flying.value = true;
  setTimeout(() => (flying.value = false), 900);
  const r = await run(() => api.me.heart());
  if (r?.matched) openMatchCelebrate();
  else if (r) notify({ message: '하트를 보냈어요. 상대가 답할 때까지 새 후보는 잠시 쉬어요.', type: 'success', displayTime: 3200 });
}

async function answer(item, accept) {
  if (!accept) {
    const ok = await confirm('이 하트에 응답하지 않을까요?<br>상대에게는 거절 사실이 알려지지 않아요.', '괜찮아요');
    if (!ok) return;
  }
  const r = await run(() => api.me.answerHeart(item.heartId, accept));
  if (r?.matched) openMatchCelebrate();
}

async function submitReview(review) {
  const r = await run(() => api.me.submitReview(review));
  if (!r) return;
  editingReview.value = false;
  if (review.couple) {
    celebrateKind.value = 'couple';
    celebrate.value = true;
  } else notify({ message: '후기를 남겼어요. 소중한 이야기 고마워요.', type: 'success', displayTime: 2600 });
}

/** 커플 최종 완료 — 진행 중인 매칭을 '커플 성사'로 마무리 */
async function completeCouple() {
  const ok = await confirm(
    `<b>${dash.value.partner?.nickname}</b>님과 커플이 되었나요?<br>최종 완료하면 두 분 모두 새 후보·하트를 더 받지 않고, 매칭 쪽지함도 닫혀요.<br><small>나중에 '다시 인연 찾기'를 누르면 두 분 모두 커플 상태가 끝나고 상대에게 안내 쪽지가 가요.</small>`,
    '커플 최종 완료',
  );
  if (!ok) return;
  const r = await run(() => api.me.completeCouple());
  if (r) {
    celebrateKind.value = 'couple';
    celebrate.value = true;
  }
}

/** 커플 완료 상태에서 다시 인연 찾기 — 두 사람 모두 커플이 풀리고, 상대에게 자동 안내 쪽지가 간다 */
async function restart() {
  const name = dash.value.couple?.partner?.nickname;
  const ok = await confirm(
    `다시 인연을 찾을까요?<br>${name ? `<b>${name}</b>님과의 ` : ''}커플 상태가 <b>두 분 모두</b> 종료되고, 상대에게는 '다시 인연 찾기를 선택했다'는 안내 쪽지가 자동으로 전해져요.<br><small>되돌릴 수 없어요. 두 분 모두 매칭 대기 중으로 돌아가요.</small>`,
    '다시 인연 찾기',
  );
  if (!ok) return;
  const r = await run(() => api.me.resume());
  if (r) notify({ message: '커플 상태를 종료했어요. 상대에게 안내 쪽지를 보냈고, 이제 새 인연을 찾아드릴게요.', type: 'success', displayTime: 3200 });
}

async function requestMore() {
  const ok = await confirm(
    "추가 매칭을 요청하면 지금 매칭은 끝나고 두 분 모두 '매칭 대기 중'으로 돌아가요.<br>상대에게는 이유가 전해지지 않아요. 요청할까요?",
    '추가 매칭 요청',
  );
  if (ok) await submitReview({ ...dash.value.review.mine, wantMore: true });
}

async function resume() {
  const r = await run(() => api.me.resume());
  if (r) notify({ message: '다시 매칭을 받아요. 새 후보를 준비할게요.', type: 'success', displayTime: 2600 });
}

const outcomeText = (v) => REVIEW_OUTCOMES.find((o) => o.value === v)?.text ?? '';

async function devNextDay() {
  api.dev.nextDay();
  await load();
  notify({ message: '개발 모드: 다음 날로 넘겼어요. 새 후보와 하트가 생겼어요.', type: 'info', displayTime: 2500 });
}
</script>

<template>
  <div class="me tone-warm">
    <div class="container">
      <header v-if="dash" class="head">
        <p class="head__eyebrow"><span class="head__stamp">親展</span> {{ app.nickname }}님에게만 보이는 화면이에요</p>
        <h1 class="head__title display">{{ dash.status === 'COUPLED' ? '두 분의 인연이 이어졌어요' : dash.status === 'MATCHING' ? '인연이 이어지고 있어요' : '오늘의 인연이 도착했어요' }}</h1>
      </header>

      <!-- 신청 전 -->
      <section v-if="noApp" class="empty">
        <SaLogo mark :height="60" />
        <h2 class="display">아직 신청서를 쓰지 않았어요</h2>
        <p>신청하면 매일 {{ DAILY_CARD_LIMIT }}명의 후보가 이곳에 도착해요.</p>
        <DxButton text="신청하러 가기" type="default" @click="router.push({ name: 'apply' })" />
      </section>

      <div v-else-if="dash" class="grid">
        <!-- 내 상태 -->
        <aside class="status">
          <p class="status__label">지금 내 상태</p>
          <UserStatusBadge :status="dash.status" large />
          <p class="status__msg">{{ USER_STATUS_MAP[dash.status]?.userText }}</p>
          <p class="status__meta mono">No.{{ String(app.id).padStart(4, '0') }} · {{ fmtDate(app.createdAt) }} 신청</p>
          <div class="status__actions">
            <DxButton
              :text="app.quick ? '신청서 마저 쓰기' : '마이페이지 · 신청서'"
              icon="edit"
              :type="app.quick ? 'default' : 'normal'"
              :styling-mode="app.quick ? 'contained' : 'outlined'"
              @click="router.push({ name: 'mypage' })"
            />
          </div>
          <p v-if="app.editLocked" class="status__lock">
            <i class="dx-icon-lock" aria-hidden="true" /> {{ LOCK_TEXT[app.lockReason] ?? LOCK_TEXT.MATCHING }}
          </p>
          <RouterLink :to="{ name: 'voc' }" class="status__voc">사緣에 바라는 점이 있나요? 개선의 소리 남기기 →</RouterLink>
          <button v-if="isMock" type="button" class="dev" @click="devNextDay">테스트 · 다음 날로 넘기기 (보낸 하트 만료 포함)</button>
        </aside>

        <div class="main">
          <!-- 매칭 중: 상대 카드 -->
          <section v-if="dash.status === 'MATCHING'" class="panel">
            <header class="panel__head">
              <h2 class="display">인연이 닿았어요</h2>
              <p>쪽지함에서 먼저 인사를 건네보세요. 그동안 새 후보와 하트는 쉬어가요.</p>
            </header>
            <ProfileCard v-if="dash.partner" :card="dash.partner" :caption="`${fmtDate(dash.partner.since)}부터 매칭 중`" />
            <div v-if="dash.partner?.accepted" class="partner__actions">
              <DxButton text="쪽지 보내기" icon="message" type="default" @click="router.push({ name: 'messages', query: { compose: `M${dash.partner.matchId}` } })" />
              <DxButton text="커플이 되었어요 · 최종 완료" icon="favorites" styling-mode="outlined" class="partner__couple" :disabled="busy" @click="completeCouple" />
              <span>매칭이 이어지는 동안만 쪽지를 주고받을 수 있어요.</span>
            </div>
            <p v-if="dash.partner && !dash.partner.accepted" class="pending">
              담당자가 두 분께 조심스럽게 의사를 묻고 있어요. 서로 수락하면 후기를 남길 수 있어요.
            </p>
          </section>

          <!-- 커플 완료 -->
          <section v-if="dash.status === 'COUPLED'" class="panel couple">
            <div class="couple__seal" aria-hidden="true">💑</div>
            <h2 class="display">커플 성사, 진심으로 축하해요</h2>
            <p>{{ dash.couple?.since ? `${fmtDate(dash.couple.since)}에 ` : '' }}두 분의 매칭을 최종 완료했어요. 새 후보와 하트는 더 이상 오지 않아요.</p>
            <ProfileCard v-if="dash.couple?.partner" :card="dash.couple.partner" caption="나의 인연" compact />
            <DxButton text="다시 인연 찾기" styling-mode="text" :disabled="busy" @click="restart" />
          </section>

          <!-- 매칭 후기 -->
          <section v-if="dash.review" class="panel review">
            <header class="panel__head">
              <h2 class="display">{{ dash.review.active ? '만남은 어떠셨나요?' : '지난 매칭은 어떠셨나요?' }}</h2>
              <p v-if="dash.review.active">만남 결과와 추가 매칭 여부를 알려주세요. 다음 추천에 반영돼요.</p>
              <p v-else>{{ dash.review.partner?.name }}님과의 매칭이 끝났어요. 짧게 후기를 남겨주시면 더 좋은 인연을 찾는 데 도움이 돼요.</p>
            </header>
            <template v-if="dash.review.mine && !editingReview">
              <dl class="review__sum">
                <div><dt>만남 결과</dt><dd>{{ outcomeText(dash.review.mine.outcome) }}</dd></div>
                <div><dt>상대 평가</dt><dd>{{ dash.review.mine.rating === 'LIKE' ? '👍 좋았어요' : '👎 별로였어요' }}</dd></div>
                <div><dt>추가 매칭</dt><dd>{{ dash.review.mine.wantMore ? '원해요' : '원하지 않아요' }}</dd></div>
                <div v-if="dash.review.mine.comment" class="review__wide"><dt>담당자에게</dt><dd>{{ dash.review.mine.comment }}</dd></div>
              </dl>
              <div class="review__actions">
                <DxButton text="후기 고치기" styling-mode="outlined" @click="editingReview = true" />
                <DxButton
                  v-if="dash.review.active && dash.review.mine.outcome === 'MET' && !dash.review.mine.wantMore"
                  text="추가 매칭 요청하기"
                  type="default"
                  :disabled="busy"
                  @click="requestMore"
                />
              </div>
            </template>
            <ReviewForm
              v-else-if="!dash.review.active || dash.partner?.accepted"
              :initial="dash.review.mine"
              :can-couple="Boolean(dash.review.active && dash.partner?.accepted)"
              :busy="busy"
              @submit="submitReview"
              @cancel="editingReview = false"
            />
          </section>

          <!-- 매칭 대기 중: 오늘의 후보 -->
          <section v-if="dash.status === 'WAITING'" class="panel deck" :aria-busy="busy">
            <header class="panel__head deck__head">
              <div>
                <h2 class="display">오늘의 인연</h2>
                <p>하루 {{ DAILY_CARD_LIMIT }}명 · 넘긴 분은 30일 동안 다시 오지 않아요</p>
              </div>
              <div class="deck__meta">
                <span v-if="progressText" class="deck__count mono">{{ progressText }}</span>
                <span class="deck__hearts" :class="{ 'is-empty': !daily.heartsLeft }" :title="`오늘 남은 하트 ${daily.heartsLeft}개`">
                  <span v-for="i in DAILY_HEART_LIMIT" :key="i" class="heart-ico" :class="{ 'is-used': i > daily.heartsLeft }" aria-hidden="true">♥</span>
                  남은 하트 {{ daily.heartsLeft }}
                </span>
              </div>
            </header>

            <div v-if="daily.pending" class="deck__pending">
              <div class="deck__pending-head">
                <span class="deck__pending-heart" aria-hidden="true">♥</span>
                <div>
                  <p class="deck__done-title">{{ daily.pending.card.nickname }}님에게 하트를 보냈어요</p>
                  <p>상대가 답하거나 {{ fmtDateTime(daily.pending.expiresAt) }}이 지나면 다음 후보를 볼 수 있어요. 그동안 다른 후보는 잠시 쉬어요.</p>
                </div>
              </div>
              <ProfileCard :card="daily.pending.card" caption="응답을 기다리는 중" compact />
            </div>

            <div v-else-if="daily.quick" class="deck__done deck__quick">
              <p class="deck__done-title">임시 신청 상태예요</p>
              <p>사주로 보낸 하트에 답이 오면 바로 알려드릴게요. 신청서를 마저 쓰면 매일 {{ DAILY_CARD_LIMIT }}명의 후보가 도착하고, 선호까지 반영해 더 잘 맞는 분을 만날 수 있어요.</p>
              <DxButton text="신청서 마저 쓰기" type="default" @click="router.push({ name: 'mypage' })" />
            </div>

            <template v-else-if="daily.current">
              <ol class="dots" aria-hidden="true">
                <li v-for="i in daily.total" :key="i" :class="{ 'is-past': i - 1 < daily.index, 'is-now': i - 1 === daily.index }" />
              </ol>
              <div class="deck__body">
              <div class="deck__left">
              <div class="deck__stage">
                <Transition name="swap" mode="out-in">
                  <ProfileCard :key="`${daily.index}-${daily.current.nickname}`" :card="daily.current" :caption="`오늘의 후보 ${progressText}`" />
                </Transition>
                <span v-if="flying" class="fly" aria-hidden="true">♥</span>
              </div>
              <div class="deck__actions">
                <DxButton text="넘기기" icon="chevronnext" styling-mode="outlined" :disabled="busy" class="deck__pass" @click="pass" />
                <DxButton
                  :text="daily.heartsLeft ? '하트 보내기' : '오늘 하트를 다 썼어요'"
                  type="default"
                  :disabled="busy || !daily.heartsLeft"
                  class="deck__heart"
                  @click="heart"
                />
              </div>
              </div>
              <Transition name="swap" mode="out-in">
                <GunghapPanel :key="`g-${daily.index}`" :gunghap="daily.current.gunghap" :nickname="daily.current.nickname" />
              </Transition>
              </div>
            </template>

            <div v-else class="deck__done">
              <template v-if="daily.selfPaused">
                <p class="deck__done-title">매칭을 잠시 쉬고 있어요</p>
                <p>준비되면 언제든 다시 받을 수 있어요. 다시 받으면 내일부터 새 후보가 도착해요.</p>
                <DxButton text="다시 매칭 받기" type="default" :disabled="busy" @click="resume" />
              </template>
              <template v-else-if="daily.gathering">
                <p class="deck__done-title">두근두근, 참여자를 모으고 있어요</p>
                <p>참여자가 모이면 첫 인연을 가장 먼저 보내드릴게요. 그동안 신청서를 꼼꼼히 채워두면 더 잘 맞는 분을 만나요.</p>
              </template>
              <template v-else-if="daily.paused">
                <p class="deck__done-title">오늘은 새 후보를 준비 중이에요</p>
                <p>담당자가 신청서를 살펴보고 있어요. 조금만 기다려 주세요.</p>
              </template>
              <template v-else-if="!daily.total">
                <p class="deck__done-title">오늘은 조건에 맞는 분이 없어요</p>
                <p>선호 조건을 조금 넓히면 더 많은 분을 만날 수 있어요. 내일 새로 찾아볼게요.</p>
                <DxButton text="선호 조건 고치기" styling-mode="outlined" @click="router.push({ name: 'mypage' })" />
              </template>
              <template v-else>
                <p class="deck__done-title">오늘의 후보를 모두 만났어요</p>
                <p>{{ daily.heartSentToday ? '보낸 하트에 답이 오면 바로 알려드릴게요. ' : '' }}내일 새 후보가 도착해요 · {{ untilTomorrow }} 남음</p>
              </template>
            </div>
          </section>

          <!-- 나에게 온 하트 -->
          <section v-if="dash.status === 'WAITING'" class="panel inbox">
            <header class="panel__head">
              <h2 class="display">
                나에게 온 하트 <span v-if="dash.inbox.length" class="inbox__n">{{ dash.inbox.length }}</span>
              </h2>
              <p>나도 하트를 보내면 서로 마음이 닿아 바로 매칭돼요. 하루 하트 개수와는 상관없어요.</p>
            </header>
            <template v-if="dash.inbox.length">
              <div class="inbox__tabs" role="tablist" aria-label="받은 하트">
                <button
                  v-for="(h, i) in dash.inbox"
                  :key="h.heartId"
                  type="button"
                  role="tab"
                  class="inbox__tab"
                  :class="{ 'is-on': inboxItem?.heartId === h.heartId }"
                  :aria-selected="inboxItem?.heartId === h.heartId"
                  @click="inboxSel = i"
                >
                  <FaceIcon :face="h.card.face" :fallback="h.card.nickname?.[0]" :size="38" />
                  <span class="inbox__tab-name">{{ h.card.nickname }}</span>
                  <small v-if="h.card.gunghap" class="mono">궁합 {{ h.card.gunghap.score }}</small>
                </button>
              </div>
              <div v-if="inboxItem" class="deck__body">
                <div class="deck__left">
                  <Transition name="swap" mode="out-in">
                    <ProfileCard :key="inboxItem.heartId" :card="inboxItem.card" :caption="`${fmtDateTime(inboxItem.at)}에 하트가 도착했어요`" />
                  </Transition>
                  <div class="deck__actions">
                    <DxButton text="괜찮아요" styling-mode="outlined" :disabled="busy" @click="answer(inboxItem, false)" />
                    <DxButton text="나도 하트 보내기 ♥" type="default" class="deck__heart" :disabled="busy" @click="answer(inboxItem, true)" />
                  </div>
                  <p v-if="dash.inbox.length > 1" class="inbox__nav">
                    <button type="button" :disabled="inboxSel === 0" @click="inboxSel--">‹ 이전</button>
                    <span class="mono">{{ inboxSel + 1 }} / {{ dash.inbox.length }}</span>
                    <button type="button" :disabled="inboxSel >= dash.inbox.length - 1" @click="inboxSel++">다음 ›</button>
                  </p>
                </div>
                <Transition name="swap" mode="out-in">
                  <GunghapPanel :key="`ig-${inboxItem.heartId}`" :gunghap="inboxItem.card.gunghap" :nickname="inboxItem.card.nickname" />
                </Transition>
              </div>
            </template>
            <p v-else class="inbox__empty">아직 도착한 하트가 없어요.</p>
          </section>
        </div>
      </div>
      <div v-else class="loading" aria-busy="true" />
    </div>

    <DxPopup
      v-model:visible="celebrate"
      :width="420"
      max-width="calc(100vw - 32px)"
      height="auto"
      :show-title="false"
      :hide-on-outside-click="true"
      :wrapper-attr="{ class: 'sa-popup tone-warm' }"
    >
      <div class="celebrate">
        <SaLogo mark :height="72" class="celebrate__seal" />
        <template v-if="celebrateKind === 'couple'">
          <h2 class="display">커플 성사를 축하해요</h2>
          <p>사緣이 맺어준 붉은 실, 오래오래 이어지길 바랄게요. 두 분의 매칭을 최종 완료했어요.</p>
        </template>
        <template v-else>
          <h2 class="display">서로 하트를 보냈어요</h2>
          <p>붉은 실이 이어졌어요. 이제 쪽지함에서 먼저 인사를 건네보세요.</p>
        </template>
        <DxButton text="확인" type="default" width="100%" @click="celebrate = false" />
      </div>
    </DxPopup>
  </div>
</template>

<style scoped>
.couple {
  display: grid;
  justify-items: center;
  gap: 10px;
  text-align: center;
  background: linear-gradient(180deg, var(--c-blush-soft), var(--c-surface));
}
.couple__seal {
  font-size: 44px;
}
.couple h2 {
  color: var(--c-crimson-deep);
}
.couple p {
  color: var(--c-ink-2);
}
.partner__couple :deep(.dx-button-text) {
  color: var(--c-crimson-deep);
  font-weight: 600;
}
.me {
  padding: clamp(24px, 4vw, 48px) 0 72px;
}
.head__eyebrow {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--c-mute);
  font-size: 14px;
}
.head__stamp {
  padding: 2px 6px;
  border: 1.5px solid var(--c-crimson);
  border-radius: 4px;
  color: var(--c-crimson);
  font-family: var(--f-display);
  font-size: 12px;
  font-weight: 700;
  transform: rotate(-3deg);
}
.head__title {
  margin-top: 8px;
  font-size: clamp(28px, 3.4vw, 40px);
  color: var(--c-indigo);
}

.grid {
  display: grid;
  grid-template-columns: 280px minmax(0, 1fr);
  gap: 24px;
  align-items: start;
  margin-top: 24px;
}
.status {
  position: sticky;
  top: calc(var(--header-h) + 20px);
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 10px;
  padding: 22px;
  background: var(--c-surface);
  border: 1px solid var(--c-line);
  border-left: 4px solid var(--c-crimson);
  border-radius: var(--r-lg);
}
.status__label {
  color: var(--c-mute);
  font-size: 13px;
}
.status__msg {
  color: var(--c-ink-2);
  font-size: 14.5px;
}
.status__meta {
  color: var(--c-mute);
  font-size: 12px;
}
.status__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 6px;
}
.status__withdraw :deep(.dx-button-text) {
  color: var(--c-mute);
}
.status__lock {
  display: flex;
  gap: 6px;
  color: var(--c-moon-ink);
  font-size: 12.5px;
}
.status__voc {
  margin-top: 6px;
  color: var(--c-indigo-3);
  font-size: 13px;
  text-underline-offset: 3px;
}
.pending {
  margin-top: 12px;
  padding: 10px 14px;
  border-radius: var(--r-md);
  background: #f6edd6;
  color: var(--c-moon-ink);
  font-size: 13.5px;
}
.review__sum {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: 8px;
  margin: 0;
}
.review__sum div {
  padding: 10px 12px;
  border-radius: var(--r-sm);
  background: var(--c-paper);
}
.review__sum .review__wide {
  grid-column: 1 / -1;
}
.review__sum dt {
  color: var(--c-mute);
  font-size: 12px;
}
.review__sum dd {
  margin: 2px 0 0;
  font-weight: 600;
}
.review__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 14px;
}
.dev {
  margin-top: 6px;
  padding: 6px 10px;
  border: 1px dashed var(--c-line-strong);
  border-radius: var(--r-sm);
  background: none;
  color: var(--c-mute);
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}

.main {
  display: flex;
  flex-direction: column;
  gap: 20px;
  min-width: 0;
}
.panel {
  padding: clamp(18px, 3vw, 28px);
  background: var(--c-surface);
  border: 1px solid var(--c-line);
  border-radius: var(--r-lg);
}
.panel__head h2 {
  font-size: 22px;
  color: var(--c-indigo);
}
.panel__head > p,
.panel__head div > p {
  margin-top: 4px;
  color: var(--c-mute);
  font-size: 13.5px;
}
.panel__head {
  margin-bottom: 16px;
}

.deck__head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
  flex-wrap: wrap;
}
.deck__meta {
  display: flex;
  align-items: center;
  gap: 10px;
}
.deck__count {
  padding: 3px 10px;
  border-radius: 999px;
  background: #e7e8f6;
  color: var(--c-indigo-3);
  font-size: 13px;
}
.deck__hearts {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 10px;
  border-radius: 999px;
  background: var(--c-blush);
  color: var(--c-crimson-deep);
  font-size: 13px;
  font-weight: 600;
}
.deck__hearts.is-empty {
  background: #ececf0;
  color: var(--c-mute);
}
.heart-ico.is-used {
  opacity: 0.3;
}
.dots {
  display: flex;
  gap: 6px;
  list-style: none;
  margin: 0 0 14px;
  padding: 0;
}
.dots li {
  flex: 1;
  height: 4px;
  border-radius: 999px;
  background: var(--c-line);
}
.dots li.is-past {
  background: var(--c-line-strong);
}
.dots li.is-now {
  background: var(--c-crimson);
}
.deck__body {
  display: grid;
  grid-template-columns: minmax(0, 1.25fr) minmax(260px, 1fr);
  gap: 20px;
  align-items: start;
}
.deck__left {
  min-width: 0;
}
.deck__stage {
  position: relative;
}
.deck__actions {
  display: grid;
  grid-template-columns: 1fr 1.4fr;
  gap: 10px;
  margin-top: 16px;
}
@media (max-width: 1100px) {
  .deck__body {
    grid-template-columns: 1fr;
  }
}
.deck__actions :deep(.dx-button) {
  height: 50px;
}
.deck__heart :deep(.dx-button-text) {
  font-size: 16px;
  font-weight: 600;
}
.deck__heart :deep(.dx-button-text)::before {
  content: '♥ ';
}
.deck__done {
  display: grid;
  gap: 8px;
  justify-items: start;
  padding: 26px;
  border-radius: var(--r-md);
  background: var(--c-paper);
  color: var(--c-ink-2);
}
.deck__done-title {
  color: var(--c-indigo);
  font-size: 18px;
  font-weight: 600;
}
.fly {
  position: absolute;
  left: 60%;
  bottom: 10px;
  color: var(--c-crimson);
  font-size: 54px;
  pointer-events: none;
  animation: fly 0.9s ease-out forwards;
}
@keyframes fly {
  0% {
    opacity: 0;
    transform: translateY(20px) scale(0.6);
  }
  30% {
    opacity: 1;
    transform: translateY(-10px) scale(1.2);
  }
  100% {
    opacity: 0;
    transform: translateY(-160px) scale(0.9) rotate(-12deg);
  }
}
.swap-enter-active,
.swap-leave-active {
  transition: opacity 0.25s ease, transform 0.25s ease;
}
.swap-enter-from {
  opacity: 0;
  transform: translateX(24px);
}
.swap-leave-to {
  opacity: 0;
  transform: translateX(-24px);
}

.inbox__n {
  display: inline-grid;
  place-items: center;
  min-width: 24px;
  height: 24px;
  margin-left: 6px;
  padding: 0 6px;
  border-radius: 999px;
  background: var(--c-crimson);
  color: #fff;
  font-family: var(--f-body);
  font-size: 13px;
  vertical-align: middle;
}
.inbox__tabs {
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
  padding-bottom: 4px;
  overflow-x: auto;
}
.inbox__tab {
  flex: none;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 14px 6px 6px;
  border: 1px solid var(--c-line);
  border-radius: 999px;
  background: var(--c-surface);
  font: inherit;
  cursor: pointer;
}
.inbox__tab.is-on {
  border-color: var(--c-crimson);
  background: var(--c-blush-soft);
  box-shadow: 0 0 0 2px var(--c-blush);
}
.inbox__tab-name {
  font-weight: 600;
  color: var(--c-indigo);
}
.inbox__tab small {
  color: var(--c-crimson-deep);
  font-size: 12px;
}
.inbox__nav {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 16px;
  margin-top: 10px;
  color: var(--c-mute);
  font-size: 13px;
}
.inbox__nav button {
  border: 0;
  background: none;
  color: var(--c-indigo-3);
  font: inherit;
  cursor: pointer;
}
.inbox__nav button:disabled {
  color: var(--c-line-strong);
  cursor: default;
}
.deck__pending {
  display: grid;
  gap: 14px;
  max-width: 620px;
}
.deck__pending-head {
  display: flex;
  gap: 14px;
  align-items: flex-start;
  padding: 16px;
  border-radius: var(--r-md);
  background: var(--c-blush-soft);
}
.deck__pending-heart {
  color: var(--c-crimson);
  font-size: 30px;
  line-height: 1;
  animation: beat 1.4s ease-in-out infinite;
}
@keyframes beat {
  0%, 100% { transform: scale(1); }
  15% { transform: scale(1.25); }
  30% { transform: scale(1); }
  45% { transform: scale(1.18); }
}
.deck__quick {
  background: var(--c-blush-soft);
}
.partner__actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  margin-top: 14px;
  color: var(--c-mute);
  font-size: 13px;
}
.inbox__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 14px;
}
.inbox__actions {
  display: flex;
  gap: 6px;
  margin-top: 8px;
}
.inbox__empty {
  color: var(--c-mute);
  font-size: 14px;
}

.empty {
  display: grid;
  justify-items: center;
  gap: 12px;
  margin-top: 28px;
  padding: 48px 24px;
  background: var(--c-surface);
  border: 1px solid var(--c-line);
  border-radius: var(--r-lg);
  text-align: center;
}
.empty h2 {
  font-size: 22px;
  color: var(--c-indigo);
}
.loading {
  min-height: 50vh;
}
.celebrate {
  display: grid;
  justify-items: center;
  gap: 12px;
  padding: 18px 8px 6px;
  text-align: center;
}
.celebrate h2 {
  font-size: 22px;
  color: var(--c-indigo);
}
.celebrate p {
  color: var(--c-ink-2);
  margin-bottom: 8px;
}
.celebrate__seal {
  transform: rotate(-6deg);
}

@media (max-width: 860px) {
  .grid {
    grid-template-columns: 1fr;
  }
  .status {
    position: static;
  }
}
@media (prefers-reduced-motion: reduce) {
  .fly,
  .swap-enter-active,
  .swap-leave-active {
    animation: none;
    transition: none;
  }
}
</style>
