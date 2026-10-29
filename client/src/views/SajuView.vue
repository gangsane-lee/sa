<script setup>
/**
 * 인연 사주 — 홈에서 들어오는 재미용 기능. 사緣을 알리고 신청으로 이어지게 하는 마케팅 장치.
 * 사주 풀이는 브라우저 안에서만 계산한다. '사주 인연 찾기'를 누를 때만 생년월일을 서버로 보내 궁합을 계산한다(저장하지 않음).
 * 개인정보 보호: 신청서에는 출생연도만 저장한다 — 생년월일의 월·일과 태어난 시간은 어디에도 저장하지 않는다.
 * '사주 인연 찾기' → 사주 궁합이 가장 높은 대기자 1명 → [하트 보내기]
 *  - 신청 전: 팝업에서 필수 항목만 채우면 신청과 하트가 한 번에 처리된다
 *  - 신청 후: 바로 하트 (오늘의 하트 1개 사용, 답이 올 때까지 신청서 수정·새 후보 잠금)
 */
import { ref, reactive, computed, onMounted, nextTick } from 'vue';
import { useRouter } from 'vue-router';
import { DxDateBox } from 'devextreme-vue/date-box';
import { DxTextBox } from 'devextreme-vue/text-box';
import { DxCheckBox } from 'devextreme-vue/check-box';
import { DxButton } from 'devextreme-vue/button';
import notify from 'devextreme/ui/notify';
import { confirm } from 'devextreme/ui/dialog';
import { session, refreshUser } from '@/stores/session';
import { api } from '@/api';
import { ELEMENTS, readSaju } from '@shared/utils/saju';
import { DxPopup } from 'devextreme-vue/popup';
import ProfileCard from '@/components/ProfileCard.vue';
import GunghapPanel from '@/components/GunghapPanel.vue';
import SaLogo from '@/components/SaLogo.vue';

const router = useRouter();
const input = reactive({ birthDate: null, birthTime: '', unknown: true });
const result = ref(null);
const applied = ref(null);
const resultEl = ref();
const pick = ref(null); // { card } — 사주로 찾은 인연
const pickEl = ref();
const picking = ref(false);
const pickNote = ref(''); // 하트를 보낼 수 없는 이유 (신청자)
const sending = ref(false);
const sentPopup = ref(false);
const sentInfo = ref({ nickname: '', to: '', matched: false, created: false });

const birthInput = () => ({ birthDate: input.birthDate, birthTime: input.unknown ? null : input.birthTime });

const PICK_STATE = {
  MATCHING: '지금은 매칭이 진행 중이라 새 인연을 찾지 않아요. 지금의 인연에 집중해 주세요.',
  COUPLED: '커플 완료 상태예요. 두 분의 인연을 응원할게요.',
  HEART_PENDING: '보낸 하트에 답을 기다리는 중이에요. 답이 오거나 72시간이 지나면 다시 찾을 수 있어요.',
  HEART_LIMIT: '오늘의 하트를 이미 썼어요. 내일 다시 사주 인연을 찾아보세요.',
  NEED_GENDER: '인사정보에 성별이 없어 사주 인연을 찾을 수 없어요. 신청서에서 성별을 알려주시면 찾아드릴게요.',
  GATHERING: '오픈 준비 중이라 사주 인연 찾기는 잠시 쉬어요. 매칭이 시작되면 가장 먼저 알려드릴게요. 내 사주 풀이는 지금도 볼 수 있어요.',
  PAUSED: '지금은 새 인연을 준비 중이에요. 조금만 기다려 주세요.',
};

/** 사주 인연 찾기 — 대기 중인 분들 중 사주 궁합이 가장 높은 1명 */
async function findPick() {
  if (!input.birthDate) {
    notify({ message: '생년월일을 먼저 입력해 주세요.', type: 'warning', displayTime: 2000 });
    return;
  }
  picking.value = true;
  pickNote.value = '';
  try {
    const r = await api.saju.pick(birthInput());
    if (r.blocked) {
      pickNote.value = '지금은 사緣에 신청할 수 없는 계정이에요.';
      return;
    }
    if (r.state) {
      pickNote.value = PICK_STATE[r.state] ?? '지금은 새 인연을 찾을 수 없어요.';
      return;
    }
    if (!r.card) {
      pickNote.value = applied.value ? '지금은 사주로 이어줄 수 있는 분이 없어요. 홈에서 오늘의 인연을 확인해 주세요.' : '지금은 매칭을 기다리는 분이 없어요. 신청해 두면 가장 먼저 인연을 보내드릴게요.';
      return;
    }
    pick.value = r;
    await nextTick();
    pickEl.value?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (e) {
    notify({ message: e.message, type: 'error', displayTime: 3000 });
  } finally {
    picking.value = false;
  }
}

/**
 * 하트 보내기 — 신청 후면 바로.
 * 신청 전이면 정규 신청과 같은 신청서(4페이지)로 간다. 신청하는 순간 이 분에게 하트가 함께 간다.
 * 사주에 입력한 생년월일은 연도만 넘긴다 (월·일은 저장하지 않음)
 */
const SAJU_KEY = 'sasystem.sajuApply';
async function heart() {
  if (!applied.value) {
    try {
      sessionStorage.setItem(SAJU_KEY, JSON.stringify({ to: pick.value.card.nickname, birthYear: Number(String(input.birthDate).slice(0, 4)) || null }));
    } catch {
      /* 저장소를 못 쓰면 빈 신청서로 시작 */
    }
    router.push({ name: 'apply', query: { from: 'saju' } });
    return;
  }
  const ok = await confirm(
    `<b>${pick.value.card.nickname}</b>님에게 하트를 보낼까요?<br><small>오늘의 하트 1개를 써요. 답이 올 때까지 신청서 수정과 새 후보는 잠시 쉬어요.</small>`,
    '하트 보내기',
  );
  if (!ok) return;
  sending.value = true;
  try {
    const r = await api.saju.heart();
    sentInfo.value = { ...r, created: false };
    sentPopup.value = true;
  } catch (e) {
    notify({ message: e.message, type: 'error', displayTime: 3500 });
  } finally {
    sending.value = false;
  }
}

const today = new Date();
const minDate = new Date(1940, 0, 1);

onMounted(async () => {
  // 신청서에는 출생연도만 있어 생년월일을 미리 채우지 않는다 (월·일은 저장하지 않음)
  const mine = await api.application.getMine().catch(() => null);
  applied.value = Boolean(mine);
});

const timeOk = computed(() => input.unknown || /^([01]\d|2[0-3]):[0-5]\d$/.test(input.birthTime ?? ''));

async function read() {
  if (!input.birthDate) {
    notify({ message: '생년월일을 입력해 주세요.', type: 'warning', displayTime: 2000 });
    return;
  }
  if (!timeOk.value) {
    notify({ message: "태어난 시간을 00:00 형식으로 적거나 '몰라요'를 체크해 주세요.", type: 'warning', displayTime: 2500 });
    return;
  }
  try {
    result.value = readSaju({ birthDate: input.birthDate, birthTime: input.unknown ? null : input.birthTime });
    await nextTick();
    resultEl.value?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch {
    notify({ message: '사주를 계산하지 못했어요. 날짜를 확인해 주세요.', type: 'error', displayTime: 2500 });
  }
}

const bars = computed(() =>
  result.value
    ? Object.entries(result.value.counts).map(([el, n]) => ({ el, n, pct: Math.round((n / result.value.total) * 100), ...ELEMENTS[el] }))
    : [],
);
const elName = (el) => `${ELEMENTS[el].name}(${ELEMENTS[el].hanja})`;
</script>

<template>
  <div class="saju tone-warm">
    <section class="intro">
      <div class="container intro__inner">
        <p class="intro__eyebrow">사緣 · 인연 사주</p>
        <h1 class="intro__title display">내 사주 속<br />붉은 실은 누구에게 닿아 있을까</h1>
        <p class="intro__lead">생년월일로 나의 기운과 끌리는 사람, 오늘의 연애운을 풀어드려요. 재미로 가볍게 봐주세요.</p>

        <form class="form" @submit.prevent="read">
          <div class="form__row">
            <label class="form__field">
              <span>생년월일</span>
              <DxDateBox
                v-model:value="input.birthDate"
                type="date"
                display-format="yyyy.MM.dd"
                date-serialization-format="yyyy-MM-dd"
                :use-mask-behavior="true"
                :min="minDate"
                :max="today"
                :calendar-options="{ zoomLevel: 'decade' }"
                placeholder="예: 1995.03.15"
                :input-attr="{ 'aria-label': '생년월일' }"
              />
            </label>
            <label class="form__field form__field--time">
              <span>태어난 시간</span>
              <DxTextBox
                v-model:value="input.birthTime"
                mask="00:00"
                mask-char="_"
                :use-masked-value="true"
                show-mask-mode="onFocus"
                placeholder="예: 14:30"
                :disabled="input.unknown"
                :input-attr="{ 'aria-label': '태어난 시간' }"
              />
            </label>
            <DxCheckBox v-model:value="input.unknown" text="시간 몰라요" class="form__unknown" />
          </div>
          <p class="form__hint">🔒 입력한 생년월일·시간은 저장하지 않고 이 화면 안에서만 계산해요. 사주 인연으로 신청해도 <b>출생연도만 저장</b>되고 <b>월·일 정보는 저장되지 않아요.</b></p>
          <DxButton text="내 인연 사주 보기" type="default" :use-submit-behavior="true" class="form__go" />
        </form>
      </div>
    </section>

    <section v-if="result" ref="resultEl" class="result">
      <div class="container">
        <!-- 4주 -->
        <div class="block">
          <header class="block__head">
            <h2 class="display">나의 사주</h2>
            <p>{{ result.zodiac }} · 나를 나타내는 글자(일간)는 <b>{{ result.dayMaster.char }}{{ result.dayMaster.ko }}</b></p>
          </header>
          <div class="pillars" role="table" aria-label="사주 4주">
            <div v-for="(p, i) in result.pillars" :key="i" class="pillar" :class="{ 'is-day': p?.label === '일주', 'is-empty': !p }" role="cell">
              <span class="pillar__label">{{ p?.label ?? '시주' }}</span>
              <template v-if="p">
                <span class="pillar__char display" :style="{ color: ELEMENTS[p.gan.el].color }">{{ p.gan.char }}</span>
                <span class="pillar__char display" :style="{ color: ELEMENTS[p.zhi.el].color }">{{ p.zhi.char }}</span>
                <span class="pillar__ko">{{ p.ko }}</span>
                <span class="pillar__els">
                  <i :style="{ background: ELEMENTS[p.gan.el].color }">{{ ELEMENTS[p.gan.el].ko }}</i>
                  <i :style="{ background: ELEMENTS[p.zhi.el].color }">{{ ELEMENTS[p.zhi.el].ko }}</i>
                </span>
              </template>
              <span v-else class="pillar__unknown">시간 모름</span>
            </div>
          </div>
          <p v-if="!result.timeKnown" class="block__note">태어난 시간을 몰라 시주는 빼고 6글자로 풀었어요.</p>
        </div>

        <div class="cols">
          <!-- 오행 -->
          <div class="block">
            <header class="block__head">
              <h2 class="display">오행의 균형</h2>
              <p>
                <b>{{ elName(result.strongest) }}</b> 기운이 가장 강하고
                <template v-if="result.missing.length">
                  <b>{{ result.missing.map(elName).join('·') }}</b> 기운이 비어 있어요.
                </template>
                <template v-else><b>{{ elName(result.weakest) }}</b> 기운이 가장 약해요.</template>
              </p>
            </header>
            <ul class="bars">
              <li v-for="b in bars" :key="b.el">
                <span class="bars__name">{{ b.name }} <small>{{ b.hanja }}</small></span>
                <span class="bars__track"><span :style="{ width: `${Math.max(b.pct, 2)}%`, background: b.color }" /></span>
                <span class="bars__n mono">{{ b.n }}</span>
              </li>
            </ul>
          </div>

          <!-- 일간 -->
          <div class="block block--dm">
            <header class="block__head">
              <h2 class="display">나는 {{ result.dayMaster.image }}</h2>
            </header>
            <p class="dm__text">{{ result.dayMaster.nature }}</p>
            <h3 class="dm__sub">연애할 때 나는</h3>
            <p class="dm__text">{{ result.dayMaster.love }}</p>
          </div>
        </div>

        <!-- 끌리는 사람 -->
        <div class="cols">
          <div class="block block--pair">
            <span class="pair__tag" :style="{ background: ELEMENTS[result.attract.element].color }">{{ ELEMENTS[result.attract.element].hanja }}</span>
            <h3>자꾸 끌리는 사람</h3>
            <p>{{ result.attract.text }}. 내게 부족한 {{ elName(result.attract.element) }} 기운을 채워줘요.</p>
          </div>
          <div class="block block--pair">
            <span class="pair__tag" :style="{ background: ELEMENTS[result.comfort.element].color }">{{ ELEMENTS[result.comfort.element].hanja }}</span>
            <h3>곁에 있으면 편안한 사람</h3>
            <p>{{ result.comfort.text }}. {{ elName(result.comfort.element) }} 기운이 나를 북돋워요.</p>
          </div>
        </div>

        <!-- 오늘의 연애운 -->
        <div class="block today">
          <div class="today__score">
            <span class="today__label">오늘의 연애운</span>
            <b class="display">{{ result.today.score }}</b>
            <span class="today__unit">점</span>
          </div>
          <div class="today__body">
            <h3 class="display">{{ result.today.title }}</h3>
            <p>{{ result.today.text }} {{ result.today.line }}</p>
            <dl class="today__lucky">
              <div><dt>행운의 장소</dt><dd>{{ result.today.place }}</dd></div>
              <div><dt>행운의 시간</dt><dd>{{ result.today.time }}</dd></div>
              <div>
                <dt>행운의 색</dt>
                <dd><i class="dot" :style="{ background: result.today.color.color }" /> {{ result.today.color.yearColor.replace('하얀', '흰') }}색</dd>
              </div>
            </dl>
          </div>
        </div>

        <!-- 사주 인연 찾기 (신청 전·후 모두 같은 버튼) -->
        <div v-if="!pick" class="cta">
          <p class="cta__line display">지금 매칭을 기다리는 사람 중에<br />내 사주와 가장 잘 맞는 단 한 사람이 있어요</p>
          <button type="button" class="cta__big" :disabled="picking" @click="findPick">
            <span class="cta__big-heart" aria-hidden="true">♥</span>
            <span>
              <b>{{ picking ? '붉은 실을 따라가는 중…' : applied ? '내 사주 인연 찾고 하트 보내기' : '내 사주 인연 찾고 신청하기' }}</b>
              <small>궁합이 가장 높은 1명을 바로 보여드려요</small>
            </span>
          </button>
          <p v-if="pickNote" class="cta__state" role="status">{{ pickNote }}</p>
          <p class="cta__note">입력한 생년월일은 궁합 계산에만 쓰고 저장하지 않아요 · 신청하면 출생연도만 저장돼요(월·일 저장 안 함) · 상시 접수</p>
        </div>

        <!-- 사주로 찾은 인연 -->
        <section v-if="pick?.card" ref="pickEl" class="pick">
          <header class="pick__head">
            <p class="pick__eyebrow">사주가 가리킨 인연</p>
            <h2 class="display">사주 궁합 <b>{{ pick.card.gunghap.score }}점</b>, 바로 이 사람이에요</h2>
            <p>지금 매칭을 기다리는 분들 중 당신의 사주와 가장 잘 맞는 단 한 사람이에요. 이런 궁합은 흔하지 않아요.</p>
          </header>
          <div class="pick__body">
            <div class="pick__left">
              <ProfileCard :card="pick.card" caption="오늘의 사주 인연" />
              <button type="button" class="pick__heart" :disabled="sending || Boolean(sentInfo.to)" @click="heart">
                <span aria-hidden="true">♥</span> {{ sentInfo.to ? '하트를 보냈어요' : '하트 보내기' }}
              </button>
              <p class="pick__note">
                {{ applied ? '오늘의 하트 1개를 써요. 상대도 나에게 하트를 보내면 바로 매칭돼요.' : '필수 항목만 채우면 바로 이 분에게 하트가 전해져요. 상대도 나에게 하트를 보내면 바로 매칭돼요.' }}
              </p>
            </div>
            <GunghapPanel :gunghap="pick.card.gunghap" :nickname="pick.card.nickname" />
          </div>
        </section>

        <p class="disclaimer">
          사주 4주는 절기 기준으로 계산하고, 태어난 시간은 서울 기준으로 30분 보정해요. 풀이·연애운·궁합은 재미로 보는 내용이며 정식 매칭 점수에는 쓰지 않아요.
        </p>
      </div>
    </section>

    <DxPopup
      v-model:visible="sentPopup"
      :width="460"
      max-width="calc(100vw - 32px)"
      height="auto"
      :show-title="false"
      :hide-on-outside-click="false"
      :wrapper-attr="{ class: 'sa-popup tone-warm' }"
    >
      <div class="sent">
        <SaLogo mark :height="68" class="sent__seal" />
        <h2 class="display">{{ sentInfo.matched ? '서로 하트를 보냈어요!' : '하트를 보냈어요' }}</h2>
        <p v-if="sentInfo.matched"><b>{{ sentInfo.to }}</b>님도 이미 하트를 보냈었어요. 바로 매칭됐어요! 쪽지함에서 인사를 건네보세요.</p>
        <p v-else>
          <b>{{ sentInfo.to }}</b>님에게 <b>{{ sentInfo.nickname }}</b>(으)로 하트가 전해졌어요. 상대도 하트를 보내면 바로 매칭돼요.
        </p>
        <div v-if="sentInfo.created && !sentInfo.matched" class="sent__boost">
          <p class="sent__boost-title">답이 오면 선택 항목도 채워보세요</p>
          <p>답을 기다리는 동안은 신청서가 잠겨요. 답을 받은 뒤 키 선호·이상형·코멘트까지 채우면 <b>다음 매칭부터</b> 더 잘 맞는 분을 매일 3명씩 만날 수 있어요.</p>
        </div>
        <DxButton :text="sentInfo.matched ? '쪽지함으로 가기' : '홈에서 답을 기다릴게요'" type="default" width="100%" @click="router.push({ name: sentInfo.matched ? 'messages' : 'home' })" />
      </div>
    </DxPopup>
  </div>
</template>

<style scoped>
.intro {
  background: var(--c-indigo);
  color: var(--c-on-indigo);
  padding: clamp(36px, 6vw, 72px) 0;
}
.intro__eyebrow {
  color: var(--c-thread-on-dark);
  font-size: 14px;
  font-weight: 600;
  letter-spacing: 0.04em;
}
.intro__title {
  margin-top: 12px;
  font-size: clamp(28px, 4vw, 46px);
  line-height: 1.3;
  color: #fff;
}
.intro__lead {
  margin-top: 14px;
  max-width: 34em;
  color: var(--c-on-indigo-mute);
}
.form {
  margin-top: 28px;
  max-width: 640px;
  padding: 20px;
  border-radius: var(--r-lg);
  background: var(--c-surface);
  color: var(--c-ink);
  box-shadow: var(--shadow-2);
}
.form__row {
  display: grid;
  grid-template-columns: 1.3fr 1fr auto;
  gap: 12px;
  align-items: end;
}
.form__field {
  display: grid;
  gap: 6px;
  font-size: 13px;
  font-weight: 600;
  color: var(--c-ink-2);
}
.form__unknown {
  padding-bottom: 10px;
}
.form__hint {
  margin-top: 10px;
  color: var(--c-mute);
  font-size: 12.5px;
}
.form__go {
  width: 100%;
  height: 48px;
  margin-top: 14px;
}
.form__go :deep(.dx-button-text) {
  font-size: 16px;
  font-weight: 600;
}

.result {
  padding: clamp(32px, 5vw, 56px) 0 72px;
}
.result .container {
  display: grid;
  gap: 18px;
}
.cols {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 18px;
}
.block {
  padding: clamp(18px, 3vw, 28px);
  background: var(--c-surface);
  border: 1px solid var(--c-line);
  border-radius: var(--r-lg);
}
.block__head h2 {
  font-size: 22px;
  color: var(--c-indigo);
}
.block__head p {
  margin-top: 4px;
  color: var(--c-ink-2);
  font-size: 14.5px;
}
.block__head {
  margin-bottom: 16px;
}
.block__note {
  margin-top: 12px;
  color: var(--c-mute);
  font-size: 13px;
}

.pillars {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
  max-width: 620px;
}
.pillar {
  display: grid;
  justify-items: center;
  gap: 2px;
  padding: 14px 6px 12px;
  border-radius: var(--r-md);
  background: var(--c-paper);
  border: 1px solid var(--c-line);
}
.pillar.is-day {
  background: var(--c-blush-soft);
  border-color: var(--c-crimson);
}
.pillar.is-empty {
  align-content: center;
  color: var(--c-mute);
}
.pillar__label {
  color: var(--c-mute);
  font-size: 12px;
  margin-bottom: 4px;
}
.pillar__char {
  font-size: clamp(30px, 5vw, 44px);
  line-height: 1.15;
  font-weight: 700;
}
.pillar__ko {
  margin-top: 4px;
  font-weight: 600;
  color: var(--c-ink-2);
}
.pillar__els {
  display: flex;
  gap: 3px;
  margin-top: 4px;
}
.pillar__els i {
  padding: 0 6px;
  border-radius: 4px;
  color: #fff;
  font-style: normal;
  font-size: 11.5px;
}
.pillar__unknown {
  font-size: 13px;
}

.bars {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 10px;
}
.bars li {
  display: grid;
  grid-template-columns: 64px 1fr 24px;
  align-items: center;
  gap: 10px;
}
.bars__name {
  font-weight: 600;
  font-size: 14px;
}
.bars__name small {
  color: var(--c-mute);
  font-weight: 400;
}
.bars__track {
  height: 10px;
  border-radius: 999px;
  background: var(--c-paper);
  overflow: hidden;
}
.bars__track span {
  display: block;
  height: 100%;
  border-radius: inherit;
}
.bars__n {
  text-align: right;
  color: var(--c-ink-2);
}

.block--dm .block__head h2 {
  font-size: 21px;
}
.dm__text {
  color: var(--c-ink-2);
}
.dm__sub {
  margin-top: 14px;
  font-size: 15px;
  color: var(--c-crimson-deep);
}

.block--pair {
  position: relative;
  padding-left: 76px;
}
.pair__tag {
  position: absolute;
  left: 20px;
  top: 22px;
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  color: #fff;
  font-family: var(--f-display);
  font-size: 20px;
  font-weight: 700;
}
.block--pair h3 {
  font-size: 17px;
  color: var(--c-indigo);
}
.block--pair p {
  margin-top: 6px;
  color: var(--c-ink-2);
}

.today {
  display: grid;
  grid-template-columns: 180px 1fr;
  gap: 24px;
  align-items: center;
  background: var(--c-indigo);
  border: 0;
  color: var(--c-on-indigo);
}
.today__score {
  display: grid;
  justify-items: center;
  padding: 16px;
  border-radius: var(--r-md);
  border: 1.5px solid var(--c-thread-on-dark);
}
.today__label {
  font-size: 13px;
  color: var(--c-on-indigo-mute);
}
.today__score b {
  font-size: 64px;
  line-height: 1;
  color: #fff;
}
.today__unit {
  color: var(--c-thread-on-dark);
}
.today__body h3 {
  font-size: 22px;
  color: #fff;
}
.today__body p {
  margin-top: 8px;
  color: var(--c-on-indigo-mute);
}
.today__lucky {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 24px;
  margin: 14px 0 0;
}
.today__lucky dt {
  font-size: 12px;
  color: var(--c-on-indigo-mute);
}
.today__lucky dd {
  margin: 0;
  font-weight: 600;
  color: #fff;
}
.dot {
  display: inline-block;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  border: 1px solid rgba(255, 255, 255, 0.6);
}

.cta {
  display: grid;
  justify-items: center;
  gap: 14px;
  padding: 32px 16px;
  text-align: center;
}
.cta__line {
  font-size: clamp(20px, 2.6vw, 28px);
  color: var(--c-indigo);
}
.cta__big {
  display: flex;
  align-items: center;
  gap: 16px;
  width: min(100%, 520px);
  padding: 20px 28px;
  border: 0;
  border-radius: 18px;
  background: linear-gradient(135deg, var(--c-crimson) 0%, #e2456a 100%);
  color: #fff;
  font: inherit;
  text-align: left;
  cursor: pointer;
  box-shadow: 0 10px 30px rgba(200, 36, 63, 0.35), 0 0 0 0 rgba(200, 36, 63, 0.5);
  animation: glow 2.4s ease-in-out infinite;
  transition: transform 0.15s ease;
}
.cta__big:hover {
  transform: translateY(-2px) scale(1.01);
}
.cta__big:disabled {
  opacity: 0.8;
  cursor: progress;
}
.cta__big b {
  display: block;
  font-size: clamp(19px, 2.4vw, 23px);
}
.cta__big small {
  display: block;
  margin-top: 2px;
  font-size: 14px;
  opacity: 0.9;
}
.cta__big-heart {
  flex: none;
  display: grid;
  place-items: center;
  width: 52px;
  height: 52px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.2);
  font-size: 26px;
  animation: beat 1.4s ease-in-out infinite;
}
@keyframes glow {
  0%, 100% { box-shadow: 0 10px 30px rgba(200, 36, 63, 0.35), 0 0 0 0 rgba(200, 36, 63, 0.45); }
  50% { box-shadow: 0 10px 30px rgba(200, 36, 63, 0.35), 0 0 0 12px rgba(200, 36, 63, 0); }
}
@keyframes beat {
  0%, 100% { transform: scale(1); }
  15% { transform: scale(1.18); }
  30% { transform: scale(1); }
  45% { transform: scale(1.12); }
}
.pick {
  padding: clamp(18px, 3vw, 32px);
  border-radius: var(--r-lg);
  background: var(--c-surface);
  border: 2px solid var(--c-crimson);
  box-shadow: var(--shadow-2);
}
.pick__eyebrow {
  color: var(--c-crimson-deep);
  font-weight: 700;
  font-size: 13px;
}
.pick__head h2 {
  margin-top: 4px;
  font-size: clamp(22px, 2.8vw, 30px);
  color: var(--c-indigo);
}
.pick__head h2 b {
  color: var(--c-crimson);
}
.pick__head p {
  margin-top: 6px;
  color: var(--c-ink-2);
}
.pick__body {
  display: grid;
  grid-template-columns: minmax(0, 1.25fr) minmax(260px, 1fr);
  gap: 20px;
  margin-top: 18px;
  align-items: start;
}
/* 하트 보내기 | 정식으로 신청하기 */
.pick__heart {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 16px;
  border: 0;
  border-radius: 14px;
  background: linear-gradient(135deg, var(--c-crimson) 0%, #e2456a 100%);
  color: #fff;
  font: inherit;
  font-size: 18px;
  font-weight: 700;
  cursor: pointer;
  box-shadow: 0 8px 22px rgba(200, 36, 63, 0.3);
  animation: glow 2.4s ease-in-out infinite;
}
.pick__heart {
  margin-top: 14px;
}
.pick__heart span {
  display: inline-block;
  animation: beat 1.4s ease-in-out infinite;
}
.pick__heart:disabled {
  opacity: 0.6;
  cursor: default;
  animation: none;
}
.cta__state {
  max-width: 520px;
  padding: 10px 14px;
  border-radius: var(--r-md);
  background: #f6edd6;
  color: var(--c-moon-ink);
  font-size: 14px;
}
.pick__note {
  margin-top: 8px;
  color: var(--c-mute);
  font-size: 12.5px;
}
.sent {
  display: grid;
  justify-items: center;
  gap: 12px;
  padding: 16px 6px 4px;
  text-align: center;
}
.sent h2 {
  font-size: 24px;
  color: var(--c-indigo);
}
.sent p {
  color: var(--c-ink-2);
}
.sent__seal {
  transform: rotate(-6deg);
}
.sent__boost {
  width: 100%;
  padding: 14px 16px;
  border-radius: var(--r-md);
  background: var(--c-blush-soft);
  border: 1px dashed var(--c-crimson);
  text-align: left;
}
.sent__boost-title {
  color: var(--c-crimson-deep) !important;
  font-weight: 700;
  margin-bottom: 4px;
}
.sent__boost b {
  color: var(--c-crimson-deep);
}
@media (max-width: 860px) {
  .pick__body {
    grid-template-columns: 1fr;
  }
}
.cta__btn {
  height: 52px;
  min-width: 220px;
}
.cta__btn :deep(.dx-button-text) {
  font-size: 16px;
  font-weight: 600;
}
.cta__note {
  color: var(--c-mute);
  font-size: 13px;
}
.disclaimer {
  color: var(--c-mute);
  font-size: 12.5px;
  text-align: center;
}

@media (max-width: 760px) {
  .cols,
  .today {
    grid-template-columns: 1fr;
  }
  .form__row {
    grid-template-columns: 1fr 1fr;
  }
  .form__row > :first-child {
    grid-column: 1 / -1;
  }
}
</style>
