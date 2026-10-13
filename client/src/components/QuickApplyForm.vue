<script setup>
/**
 * 사주 하트용 간편 신청서 — 필수 항목만 받는다.
 *  - 이름·성별·사업부·팀: 사내 인사정보 / 생년월일·시간: 사주 풀이에 입력한 값
 *  - 선호 우선순위는 '나이', 피하고 싶은 범위는 '같은 팀'으로 기본 설정 (나중에 마이페이지에서 고칠 수 있음)
 *  - 검증은 서버와 같은 validateApplication 기준
 */
import { reactive, ref, computed, watch } from 'vue';
import { DxTextBox } from 'devextreme-vue/text-box';
import { DxSelectBox } from 'devextreme-vue/select-box';
import { DxTagBox } from 'devextreme-vue/tag-box';
import { DxRadioGroup } from 'devextreme-vue/radio-group';
import { DxRangeSlider } from 'devextreme-vue/range-slider';
import { DxCheckBox } from 'devextreme-vue/check-box';
import { api } from '@/api';
import { options, codeStore, ct } from '@/stores/codes';
import { SERIOUSNESS, GENDERS } from '@/constants/codes';
import { emptyForm, fromFormModel } from '@/utils/applicationModel';
import { validateApplication, ageOf, RULES } from '@/utils/applicationRules';
import { fmtDate } from '@/utils/format';

const props = defineProps({
  user: { type: Object, required: true },
  birthDate: { type: String, required: true },
  birthTime: { type: String, default: null },
});

const age = ageOf(props.birthDate) ?? 30;
const f = reactive({
  ...emptyForm(props.user),
  birthDate: props.birthDate,
  birthTime: props.birthTime,
  birthTimeUnknown: !props.birthTime,
  prefAge: [Math.max(RULES.prefAge.min, age - 5), Math.min(RULES.prefAge.max, age + 5)],
  priorities: ['AGE'],
  avoid: ['TEAM'],
});
const errors = ref([]);
const touched = ref(false);

const nickBusy = ref(false);
const nickSuggestions = ref([]);
async function suggest() {
  nickBusy.value = true;
  try {
    nickSuggestions.value = await api.application.suggestNicknames(4);
  } finally {
    nickBusy.value = false;
  }
}

/** 이 팝업에서 고칠 수 있는 항목 */
const FIELDS = ['닉네임', '진지한 만남 여부', '키', '체형', '얼굴상', '외모', 'MBTI', '취미', '음주', '흡연', '선호 나이', '필수 동의'];
const bad = (label) => touched.value && errors.value.includes(label);
/**
 * 인사정보·사주 입력값처럼 이 팝업에서 고칠 수 없는 항목의 오류.
 * 예전에는 화면에 안 보이는 항목이라 걸러 버려서, 무엇이 문제인지 모른 채 하트를 보낼 수 없었다
 */
const fixedErrors = computed(() => (touched.value ? errors.value.filter((x) => !FIELDS.includes(x) && !x.startsWith('선호')) : []));

function check() {
  touched.value = true;
  errors.value = validateApplication(fromFormModel(f), codeStore.codes);
  return errors.value;
}
/** 부모가 '하트 보내기'를 누르면 호출 — 문제 없으면 API 데이터, 있으면 null */
function result() {
  const e = check();
  return e.length ? null : fromFormModel(f);
}
/** 정식 신청서로 넘어갈 때 지금까지 적은 값 (검증 없이 그대로) */
const draft = () => JSON.parse(JSON.stringify(f));
defineExpose({ result, errors, draft });
// 한 번 '하트 보내기'를 누른 뒤에는 고칠 때마다 빨간 표시를 바로 갱신
watch(f, () => touched.value && check(), { deep: true });
// 취미는 최대 5개 — 넘치면 앞의 5개만 남긴다
watch(
  () => f.hobbies.length,
  (n) => {
    if (n > RULES.hobbies.max) f.hobbies = f.hobbies.slice(0, RULES.hobbies.max);
  },
);

const missingText = computed(() => errors.value.filter((x) => FIELDS.includes(x) || x.startsWith('선호')).join(', '));
</script>

<template>
  <div class="qa">
    <dl class="qa__fixed">
      <div><dt>이름</dt><dd>{{ user.name }}</dd></div>
      <div><dt>성별</dt><dd>{{ GENDERS.find((g) => g.value === user.gender)?.text ?? '-' }}</dd></div>
      <div><dt>소속</dt><dd>{{ ct('DIVISION', user.division) }} · {{ user.team }}</dd></div>
      <div><dt>생년월일</dt><dd>{{ fmtDate(birthDate) }}{{ birthTime ? ` ${birthTime}` : '' }}</dd></div>
    </dl>
    <p class="qa__src">사내 인사정보와 사주에 입력한 값이에요. 다른 신청자에게는 닉네임·나이·사업부만 보여요.</p>

    <div class="qa__grid">
      <label class="qa__f qa__f--wide" :class="{ 'is-bad': bad('닉네임') }">
        <span>닉네임 <em>*</em></span>
        <div class="qa__nick">
          <DxTextBox v-model:value="f.nickname" :max-length="5" placeholder="한글 2~5글자" value-change-event="input" :input-attr="{ 'aria-label': '닉네임' }" />
          <button type="button" class="qa__suggest" :disabled="nickBusy" @click="suggest">추천</button>
        </div>
        <span v-if="nickSuggestions.length" class="qa__chips">
          <button v-for="n in nickSuggestions" :key="n" type="button" @click="f.nickname = n">{{ n }}</button>
        </span>
      </label>

      <div class="qa__f qa__f--wide" :class="{ 'is-bad': bad('진지한 만남 여부') }">
        <span>진지한 만남을 원하나요? <em>*</em></span>
        <DxRadioGroup v-model:value="f.serious" :items="SERIOUSNESS" value-expr="value" display-expr="text" layout="horizontal" />
      </div>

      <label class="qa__f" :class="{ 'is-bad': bad('키') }">
        <span>키 <em>*</em></span>
        <DxSelectBox v-model:value="f.heightBand" :items="options('HEIGHT')" value-expr="value" display-expr="text" placeholder="골라주세요" />
      </label>
      <label class="qa__f" :class="{ 'is-bad': bad('체형') }">
        <span>체형 <em>*</em></span>
        <DxSelectBox v-model:value="f.body" :items="options('BODY')" value-expr="value" display-expr="text" placeholder="골라주세요" />
      </label>
      <label class="qa__f" :class="{ 'is-bad': bad('얼굴상') }">
        <span>얼굴상 <em>*</em></span>
        <DxSelectBox v-model:value="f.face" :items="options('FACE')" value-expr="value" display-expr="text" placeholder="골라주세요" />
      </label>
      <label class="qa__f" :class="{ 'is-bad': bad('MBTI') }">
        <span>MBTI <em>*</em></span>
        <DxSelectBox v-model:value="f.mbti" :items="options('MBTI')" value-expr="value" display-expr="text" :search-enabled="true" placeholder="예: ENFP" />
      </label>
      <div class="qa__f qa__f--wide" :class="{ 'is-bad': bad('외모') }">
        <span>외모 (스스로 평가 · 담당자만 봐요) <em>*</em></span>
        <DxRadioGroup v-model:value="f.looks" :items="options('LOOKS')" value-expr="value" display-expr="text" layout="horizontal" />
      </div>
      <label class="qa__f qa__f--wide" :class="{ 'is-bad': bad('취미') }">
        <span>취미 (1~5개) <em>*</em></span>
        <DxTagBox
          v-model:value="f.hobbies"
          :items="options('HOBBY')"
          value-expr="value"
          display-expr="text"
          :search-enabled="true"
          :max-displayed-tags="5"
          :hide-selected-items="true"
          apply-value-mode="instantly"
          placeholder="예: 러닝, 맛집 탐방"
        />
      </label>
      <div class="qa__f qa__f--wide" :class="{ 'is-bad': bad('음주') }">
        <span>음주 <em>*</em></span>
        <DxRadioGroup v-model:value="f.drinking" :items="options('DRINKING')" value-expr="value" display-expr="text" layout="horizontal" />
      </div>
      <div class="qa__f qa__f--wide" :class="{ 'is-bad': bad('흡연') }">
        <span>흡연 <em>*</em></span>
        <DxRadioGroup v-model:value="f.smoking" :items="options('SMOKING')" value-expr="value" display-expr="text" layout="horizontal" />
      </div>
      <div class="qa__f qa__f--wide" :class="{ 'is-bad': bad('선호 나이') }">
        <span>만나고 싶은 나이 <em>*</em> <b class="qa__age">{{ f.prefAge[0] }}~{{ f.prefAge[1] }}세</b></span>
        <DxRangeSlider
          :start="f.prefAge[0]"
          :end="f.prefAge[1]"
          :min="RULES.prefAge.min"
          :max="RULES.prefAge.max"
          value-change-mode="onHandleRelease"
          @value-changed="(e) => (f.prefAge = [e.start, e.end])"
        />
      </div>
    </div>

    <div class="qa__agree" :class="{ 'is-bad': bad('필수 동의') }">
      <DxCheckBox v-model:value="f.agreePrivacy" text="[필수] 개인정보 수집·이용에 동의해요" />
      <DxCheckBox v-model:value="f.agreeShare" text="[필수] 서로 수락한 경우(하트 교환 또는 담당자 제안)에만 이름·소속이 상대에게 전달되는 것에 동의해요" />
      <RouterLink :to="{ name: 'privacy' }" target="_blank" class="qa__privacy">개인정보 처리 안내 보기</RouterLink>
    </div>

    <p v-if="touched && missingText" class="qa__err" role="alert">아직 비어 있거나 확인이 필요해요: {{ missingText }}</p>
    <p v-if="fixedErrors.length" class="qa__err" role="alert">
      {{ fixedErrors.join(', ') }} 항목이 신청 조건과 맞지 않아요. 이 항목은 여기서 고칠 수 없어서
      <RouterLink :to="{ name: 'apply' }">전체 신청서</RouterLink>에서 확인해 주세요.
    </p>
  </div>
</template>

<style scoped>
.qa {
  display: grid;
  gap: 14px;
}
.qa__fixed {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;
  margin: 0;
  padding: 12px 14px;
  border-radius: var(--r-md);
  background: var(--c-paper);
}
.qa__fixed dt {
  color: var(--c-mute);
  font-size: 12px;
}
.qa__fixed dd {
  margin: 2px 0 0;
  font-weight: 600;
  font-size: 14px;
}
.qa__src {
  margin-top: -8px;
  color: var(--c-mute);
  font-size: 12.5px;
}
.qa__grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px 14px;
}
.qa__f {
  display: grid;
  gap: 6px;
  min-width: 0;
}
.qa__f > span {
  font-size: 13px;
  font-weight: 600;
  color: var(--c-ink-2);
}
.qa__f em {
  color: var(--c-crimson);
  font-style: normal;
}
.qa__f--wide {
  grid-column: 1 / -1;
}
.qa__f.is-bad > span {
  color: var(--c-crimson-deep);
}
.qa__f.is-bad :deep(.dx-texteditor),
.qa__f.is-bad :deep(.dx-radiogroup) {
  outline: 2px solid rgba(200, 30, 60, 0.35);
  outline-offset: 2px;
  border-radius: 6px;
}
.qa__nick {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 6px;
}
.qa__suggest {
  padding: 0 14px;
  border: 1px solid var(--c-line);
  border-radius: var(--r-md);
  background: var(--c-surface);
  font: inherit;
  cursor: pointer;
}
.qa__chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.qa__chips button {
  padding: 4px 10px;
  border: 1px solid var(--c-line);
  border-radius: 999px;
  background: var(--c-blush-soft);
  font: inherit;
  font-size: 13px;
  cursor: pointer;
}
.qa__age {
  margin-left: 6px;
  color: var(--c-crimson-deep);
}
.qa__agree {
  display: grid;
  gap: 8px;
  padding: 12px 14px;
  border-radius: var(--r-md);
  border: 1px solid var(--c-line);
}
.qa__agree.is-bad {
  border-color: var(--c-crimson);
}
.qa__privacy {
  font-size: 12.5px;
  color: var(--c-mute);
}
.qa__err {
  color: var(--c-crimson-deep);
  font-size: 13px;
  font-weight: 600;
}
@media (max-width: 560px) {
  .qa__fixed,
  .qa__grid {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
