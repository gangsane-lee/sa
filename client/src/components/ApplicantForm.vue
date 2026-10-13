<script setup>
/**
 * 신청서 폼 — 신청자 화면(ApplyView)과 관리자 상세/수정 팝업이 함께 쓴다.
 * 선택 목록은 기준정보(stores/codes), 유효성 기준은 utils/applicationRules.js 의 RULES (서버 검증과 동일).
 */
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue';
import {
  DxForm, DxGroupItem, DxSimpleItem, DxLabel,
  DxRequiredRule, DxPatternRule, DxStringLengthRule, DxCustomRule,
} from 'devextreme-vue/form';
import notify from 'devextreme/ui/notify';
// 모듈 방식에서는 DxForm이 editorType으로 쓰는 편집기를 직접 등록해야 한다 (E1035 방지)
import 'devextreme/ui/radio_group';
import 'devextreme/ui/select_box';
import 'devextreme/ui/tag_box';
import 'devextreme/ui/text_area';
import 'devextreme/ui/check_box';
import 'devextreme/ui/range_slider';
import 'devextreme/ui/date_box';
import { GENDERS, AVOID_OPTIONS, PREF_ITEMS, MAX_PRIORITIES, SERIOUSNESS, AGE_GAP } from '@/constants/codes';
import { api } from '@/api';
import { options, rank } from '@/stores/codes';
import { RULES, ageOf } from '@/utils/applicationRules';
import PriorityPicker from './PriorityPicker.vue';
import ChipSelect from './ChipSelect.vue';

const props = defineProps({
  formData: { type: Object, required: true },
  readOnly: { type: Boolean, default: false },
  /** 관리자 화면: 동의 항목과 안내 문구를 숨긴다 */
  admin: { type: Boolean, default: false },
});
const emit = defineEmits(['change']);

const formRef = ref();
const priorityError = ref('');
const pickerEl = ref();

// ── 편집기 옵션 ────────────────────────────────────────
const select = (items, placeholder, extra = {}) => ({
  items, valueExpr: 'value', displayExpr: 'text', placeholder, ...extra,
});
const radios = (items) => ({ items, valueExpr: 'value', displayExpr: 'text', layout: 'horizontal' });
const tags = (items, placeholder = '상관없어요', extra = {}) => ({
  items, valueExpr: 'value', displayExpr: 'text', placeholder, searchEnabled: items.length > 8, hideSelectedItems: true,
  multiline: true, showDropDownButton: true, applyValueMode: 'instantly', showClearButton: true, ...extra,
});

const today = new Date();
const minBirth = new Date(today.getFullYear() - RULES.age.max - 1, today.getMonth(), today.getDate() + 1);
const maxBirth = new Date(today.getFullYear() - RULES.age.min, today.getMonth(), today.getDate());

/** 고정 옵션 — 기준정보는 화면 진입 전에 불러오므로 한 번만 만든다.
 *  (값에 따라 바뀌는 옵션까지 한 computed에 넣으면 입력할 때마다 폼 전체가 다시 그려져 배치가 깨진다) */
const opt = {
  name: { readOnly: true, inputAttr: { 'aria-readonly': 'true' } }, // 사내 인사정보 값 — 바꿀 수 없음
  nickname: { placeholder: '예: 달빛고양이', maxLength: 5, inputAttr: { lang: 'ko', autocomplete: 'off' } },
  serious: { items: SERIOUSNESS, valueExpr: 'value', displayExpr: 'text', layout: 'horizontal' },
  gender: radios(GENDERS),
  birthDate: {
    type: 'date', displayFormat: 'yyyy.MM.dd', dateSerializationFormat: 'yyyy-MM-dd', useMaskBehavior: true,
    min: minBirth, max: maxBirth, placeholder: '예: 1995.03.15', openOnFieldClick: false,
    calendarOptions: { zoomLevel: 'decade' },
  },
  birthTimeUnknown: { text: '태어난 시간을 몰라요' },
  division: select(options('DIVISION'), '사업부를 골라주세요'),
  team: { placeholder: '예: DRAM설계팀', maxLength: 30 },
  campus: select(options('CAMPUS'), '선택 안 함', { showClearButton: true }),
  residence: { placeholder: '예: 화성 동탄', maxLength: RULES.residence.max },
  heightBand: select(options('HEIGHT'), '키를 골라주세요'),
  body: select(options('BODY'), '체형을 골라주세요'),
  face: select(options('FACE'), '얼굴상을 골라주세요'),
  looks: radios(options('LOOKS')),
  mbti: select(options('MBTI'), '예: ENFP', { searchEnabled: true }),
  hobbies: tags(options('HOBBY'), '예: 러닝, 맛집 탐방', { searchEnabled: true }),
  drinking: radios(options('DRINKING')),
  smoking: radios(options('SMOKING')),
  agreeSensitive: { text: '종교 정보 제공에 동의해요 (민감정보 · 선택)' },
  comment: {
    height: 96, maxLength: RULES.comment.max,
    placeholder: '예: 주말엔 캠핑 장비를 챙겨 떠나요. 불멍하면서 이런저런 이야기 나눌 수 있는 분이면 좋겠어요.',
  },

  prefAge: {
    min: RULES.prefAge.min, max: RULES.prefAge.max,
    // 끄는 동안 값을 계속 바꾸면 폼이 항목을 다시 그려 손잡이가 끊긴다 → 놓을 때 한 번만 반영
    valueChangeMode: 'onHandleRelease',
    tooltip: { enabled: true, showMode: 'always', position: 'top', format: (v) => `${v}세` },
  },
  prefHeightMin: select(options('HEIGHT'), '상관없어요', { showClearButton: true }),
  prefHeightMax: select(options('HEIGHT'), '상관없어요', { showClearButton: true }),
  avoid: tags(AVOID_OPTIONS, '피하지 않아요', { showSelectionControls: true, hideSelectedItems: false, searchEnabled: false }),
  prefDivisions: tags(options('DIVISION')),
  prefFaces: tags(options('FACE')),
  prefHobbies: tags(options('HOBBY'), '상관없어요', { searchEnabled: true }),
  prefDrinking: tags(options('DRINKING')),
  prefMbtis: tags(options('MBTI'), '상관없어요', { searchEnabled: true }),
  prefSmoking: tags(options('SMOKING')),
  prefBodies: tags(options('BODY')),

  agreePrivacy: { text: '[필수] 개인정보 수집·이용에 동의해요' },
  agreeShare: { text: '[필수] 서로 수락한 경우(하트 교환 또는 담당자 제안)에만 이름·소속이 상대에게 전달되는 것에 동의해요' },
};

// 값에 따라 바뀌는 옵션(사용 가능 여부)은 편집기에 직접 반영한다.
// 폼이 다시 그려질 때(repaint·화면 폭 변경)는 처음 옵션으로 돌아가므로 content-ready마다 다시 맞춘다
// (예전 버그: 화면 폭이 바뀐 뒤 민감정보에 동의해도 '선호 종교'가 비활성으로 남던 문제)
const dyn = () => {
  const f = props.formData;
  const ro = props.readOnly;
  return {
    birthTime: { disabled: f.birthTimeUnknown && !ro },
    religion: {
      placeholder: f.agreeSensitive ? '선택 안 함' : '아래 민감정보 동의 후 입력할 수 있어요',
      disabled: !f.agreeSensitive && !ro,
    },
    prefReligions: {
      placeholder: f.agreeSensitive ? '상관없어요' : '민감정보 동의 후 고를 수 있어요',
      disabled: !f.agreeSensitive && !ro,
    },
  };
};
const init = dyn();
const birthTimeOpt = { mask: '00:00', maskChar: '_', useMaskedValue: true, showMaskMode: 'onFocus', placeholder: '예: 14:30', ...init.birthTime };
const buildingOpt = { placeholder: '예: 연구동, R&D센터 (직접 입력)', maxLength: 30, showClearButton: true };
const religionOpt = select(options('RELIGION'), init.religion.placeholder, { showClearButton: true, disabled: init.religion.disabled });
const prefReligionsOpt = tags(options('RELIGION'), init.prefReligions.placeholder, { disabled: init.prefReligions.disabled });

watch(() => props.readOnly, () => syncDynamic());

/**
 * DevExtreme 26.1 DxForm: 화면 폭이 xs(1열)↔sm 이상(2열)으로 바뀌며 다시 배치될 때
 * col-span이 무시되는 문제가 있어(옵션 값은 그대로) 화면 구간이 바뀌면 repaint로 다시 그린다.
 */
const SCREEN_BREAKS = [768, 992, 1200]; // DevExtreme 기본 xs/sm/md/lg 경계
const screenOf = () => SCREEN_BREAKS.filter((b) => window.innerWidth >= b).length;
let lastScreen = screenOf();
let resizeTimer;
function onResize() {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    const now = screenOf();
    if (now !== lastScreen) {
      lastScreen = now;
      formRef.value?.instance.repaint();
    }
  }, 150);
}
onMounted(() => window.addEventListener('resize', onResize));
onBeforeUnmount(() => {
  window.removeEventListener('resize', onResize);
  clearTimeout(resizeTimer);
});

function syncDynamic() {
  const form = formRef.value?.instance;
  if (!form) return;
  for (const [field, o] of Object.entries(dyn())) form.getEditor(field)?.option(o);
}

// ── 닉네임 추천 ─────────────────────────────────────────
const nickSuggestions = ref([]);
const nickBusy = ref(false);
async function suggest() {
  nickBusy.value = true;
  try {
    nickSuggestions.value = await api.application.suggestNicknames(4);
  } catch (e) {
    notify({ message: e.message, type: 'error', displayTime: 2500 });
  } finally {
    nickBusy.value = false;
  }
}
function useNickname(n) {
  formRef.value?.instance.updateData('nickname', n);
  formRef.value?.instance.getEditor('nickname')?.focus();
}

// ── 우선순위 ───────────────────────────────────────────
const prefSet = (f, item) => {
  if (item === 'AGE') return true;
  if (item === 'HEIGHT') return Boolean(f.prefHeightMin && f.prefHeightMax);
  const key = PREF_ITEMS.find((p) => p.value === item)?.key;
  return Boolean(key && f[key]?.length);
};
const availablePriorities = computed(() => PREF_ITEMS.map((p) => p.value).filter((v) => prefSet(props.formData, v)));

function setChips(key, v) {
  props.formData[key] = v;
  prunePriorities();
  emit('change', { dataField: key, value: v });
}

function setPrefFaces(v) {
  props.formData.prefFaces = v;
  prunePriorities();
  emit('change', { dataField: 'prefFaces', value: v });
}

function setPriorities(v) {
  props.formData.priorities = v;
  priorityError.value = '';
  emit('change', { dataField: 'priorities', value: v });
}

/** 선호를 비우면 그 항목은 우선순위에서도 뺀다 */
function prunePriorities() {
  const kept = (props.formData.priorities ?? []).filter((v) => prefSet(props.formData, v));
  if (kept.length !== (props.formData.priorities ?? []).length) props.formData.priorities = kept;
}

function checkPriorities() {
  const n = props.formData.priorities?.length ?? 0;
  priorityError.value = n < RULES.priorities.min ? '중요한 선호 항목을 1개 이상 골라주세요.' : '';
  return !priorityError.value;
}

defineExpose({
  /** @returns {{ isValid: boolean, count: number, focus: () => void }} */
  validate() {
    const r = formRef.value.instance.validate();
    const prOk = checkPriorities();
    const first = r.brokenRules[0]?.validator;
    return {
      isValid: r.isValid && prOk,
      count: new Set(r.brokenRules.map((x) => x.validator)).size + (prOk ? 0 : 1),
      focus() {
        if (first) {
          first.$element()[0]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
          setTimeout(() => first.focus(), 350);
        } else pickerEl.value?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      },
    };
  },
});

// ── 동적 도움말 ────────────────────────────────────────
const ageHelp = computed(() => {
  const age = ageOf(props.formData.birthDate);
  return age != null ? `만 ${age}세 · 나이는 자동으로 계산돼요` : '나이는 생년월일로 자동 계산돼요.';
});
const commentHelp = computed(() => `${(props.formData.comment ?? '').trim().length}/${RULES.comment.max}자 · 후보 카드에 앞부분이 보여요`);
const heightRangeOk = () => {
  const { prefHeightMin: lo, prefHeightMax: hi } = props.formData;
  if (!lo && !hi) return true;
  return Boolean(lo && hi) && rank('HEIGHT', lo) <= rank('HEIGHT', hi);
};

const LIMITS = { hobbies: RULES.hobbies.max };
const countBetween = ({ min, max }) => (e) => Array.isArray(e.value) && e.value.length >= min && e.value.length <= max;
const birthOk = (e) => {
  const a = ageOf(e.value);
  return a != null && a >= RULES.age.min && a <= RULES.age.max;
};

function onFieldDataChanged(e) {
  const form = formRef.value?.instance;
  if (e.dataField === 'agreeSensitive' && !e.value) {
    form?.updateData('religion', null);
    form?.updateData('prefReligions', []);
  }
  if (e.dataField === 'birthTimeUnknown' && e.value) form?.updateData('birthTime', null);
  const limit = LIMITS[e.dataField];
  if (limit && Array.isArray(e.value) && e.value.length > limit) {
    form?.updateData(e.dataField, e.value.slice(0, limit));
    notify({ message: `최대 ${limit}개까지 고를 수 있어요.`, type: 'warning', displayTime: 1800 });
  }
  if (['birthTimeUnknown', 'campus', 'agreeSensitive'].includes(e.dataField)) syncDynamic();
  prunePriorities();
  emit('change', e);
}
</script>

<template>
  <DxForm
    ref="formRef"
    class="sa-form"
    :form-data="formData"
    :read-only="readOnly"
    label-location="top"
    :show-colon-after-label="false"
    :show-optional-mark="!readOnly"
    optional-mark="선택"
    :col-count="1"
    @field-data-changed="onFieldDataChanged"
    @content-ready="syncDynamic"
  >
    <!-- 나 -->
    <DxGroupItem caption="나는 이런 사람" css-class="sec sec-basic" :col-count="2" :col-count-by-screen="{ xs: 1, sm: 2 }">
      <DxSimpleItem :visible="!admin && !readOnly" :col-span="2" template="basicNote" />

      <DxSimpleItem
        data-field="name"
        :editor-options="opt.name"
        css-class="name-locked"
        help-text="사내 인사정보에서 불러와 바꿀 수 없어요. 신청 후에는 'ㄱㅎㄴ'처럼 초성으로만 보여요."
      >
        <DxLabel text="이름" />
      </DxSimpleItem>
      <DxSimpleItem data-field="gender" editor-type="dxRadioGroup" :editor-options="opt.gender" help-text="신청 후 성별을 바꾸면 보낸·받은 하트와 오늘의 후보가 모두 초기화돼요.">
        <DxLabel text="성별" />
        <DxRequiredRule message="성별을 골라주세요." />
      </DxSimpleItem>

      <DxSimpleItem data-field="nickname" :editor-options="opt.nickname" help-text="한글 2~5글자 · 후보 카드에 이름 대신 보여요.">
        <DxLabel text="닉네임" />
        <DxRequiredRule message="닉네임을 정해주세요. 오른쪽 '추천받기'도 있어요." />
        <DxPatternRule :pattern="RULES.nickname.pattern" :message="RULES.nickname.message" />
      </DxSimpleItem>
      <DxSimpleItem :visible="!readOnly" template="nickTpl">
        <DxLabel text="닉네임 추천" />
      </DxSimpleItem>

      <DxSimpleItem data-field="serious" editor-type="dxRadioGroup" :editor-options="opt.serious" :col-span="2" help-text="같은 마음인 분을 우선 추천해요. 후보 카드에 함께 보여요.">
        <DxLabel text="진지한 만남을 원하나요?" />
        <DxRequiredRule message="진지한 만남 여부를 골라주세요." />
      </DxSimpleItem>

      <DxSimpleItem data-field="birthDate" editor-type="dxDateBox" :editor-options="opt.birthDate" :help-text="ageHelp">
        <DxLabel text="생년월일" />
        <DxRequiredRule message="생년월일을 입력해 주세요." />
        <DxCustomRule :validation-callback="birthOk" :message="`만 ${RULES.age.min}~${RULES.age.max}세만 신청할 수 있어요.`" />
      </DxSimpleItem>
      <DxGroupItem :col-count="2" css-class="birth-time" :col-count-by-screen="{ xs: 2, sm: 2 }">
        <DxSimpleItem data-field="birthTime" :editor-options="birthTimeOpt" help-text="사주 궁합 참고용">
          <DxLabel text="태어난 시간" />
          <DxCustomRule
            :validation-callback="(e) => formData.birthTimeUnknown || RULES.birthTime.pattern.test(e.value ?? '')"
            message="00:00~23:59 형식으로 적거나 '몰라요'를 체크해 주세요."
          />
        </DxSimpleItem>
        <DxSimpleItem data-field="birthTimeUnknown" editor-type="dxCheckBox" :editor-options="opt.birthTimeUnknown" css-class="time-unknown">
          <DxLabel :visible="false" />
        </DxSimpleItem>
      </DxGroupItem>

      <DxSimpleItem data-field="division" editor-type="dxSelectBox" :editor-options="opt.division">
        <DxLabel text="사업부" />
        <DxRequiredRule message="사업부를 골라주세요." />
      </DxSimpleItem>
      <DxSimpleItem data-field="team" :editor-options="opt.team" help-text="같은 팀 피하기에 쓰여요. 상대에게는 보이지 않아요.">
        <DxLabel text="팀" />
        <DxRequiredRule message="팀을 입력해 주세요." />
        <DxPatternRule :pattern="RULES.team.pattern" :message="RULES.team.message" />
      </DxSimpleItem>

      <DxSimpleItem data-field="campus" editor-type="dxSelectBox" :editor-options="opt.campus">
        <DxLabel text="캠퍼스" />
      </DxSimpleItem>
      <DxSimpleItem data-field="building" :editor-options="buildingOpt" help-text="같은 캠퍼스·같은 건물 이름이면 '같은 건물 피하기'에 쓰여요. 상대에게는 보이지 않아요.">
        <DxLabel text="건물 위치" />
        <DxPatternRule :pattern="RULES.building.pattern" :message="RULES.building.message" />
      </DxSimpleItem>

      <DxSimpleItem data-field="heightBand" editor-type="dxSelectBox" :editor-options="opt.heightBand">
        <DxLabel text="키" />
        <DxRequiredRule message="키를 골라주세요." />
      </DxSimpleItem>
      <DxSimpleItem data-field="body" editor-type="dxSelectBox" :editor-options="opt.body">
        <DxLabel text="체형" />
        <DxRequiredRule message="체형을 골라주세요." />
      </DxSimpleItem>

      <DxSimpleItem data-field="face" editor-type="dxSelectBox" :editor-options="opt.face">
        <DxLabel text="얼굴상" />
        <DxRequiredRule message="얼굴상을 골라주세요." />
      </DxSimpleItem>
      <DxSimpleItem data-field="looks" editor-type="dxRadioGroup" :editor-options="opt.looks" help-text="스스로 생각하는 정도 · 상대에게 보이지 않고 담당자 참고용이에요.">
        <DxLabel text="외모" />
        <DxRequiredRule message="외모를 골라주세요." />
      </DxSimpleItem>

      <DxSimpleItem data-field="mbti" editor-type="dxSelectBox" :editor-options="opt.mbti">
        <DxLabel text="MBTI" />
        <DxRequiredRule message="MBTI를 골라주세요." />
      </DxSimpleItem>
      <DxSimpleItem data-field="residence" :editor-options="opt.residence" help-text="시·구 정도면 충분해요.">
        <DxLabel text="사는 곳" />
      </DxSimpleItem>

      <DxSimpleItem data-field="drinking" editor-type="dxRadioGroup" :editor-options="opt.drinking">
        <DxLabel text="음주" />
        <DxRequiredRule message="음주 스타일을 골라주세요." />
      </DxSimpleItem>
      <DxSimpleItem data-field="smoking" editor-type="dxRadioGroup" :editor-options="opt.smoking">
        <DxLabel text="흡연" />
        <DxRequiredRule message="흡연 여부를 골라주세요." />
      </DxSimpleItem>

      <DxSimpleItem
        data-field="hobbies"
        editor-type="dxTagBox"
        :editor-options="opt.hobbies"
        :col-span="2"
        :help-text="`${RULES.hobbies.min}~${RULES.hobbies.max}개 · 후보 카드에 3개까지 보여요.`"
      >
        <DxLabel text="취미" />
        <DxRequiredRule message="취미를 1개 이상 골라주세요." />
        <DxCustomRule :validation-callback="countBetween(RULES.hobbies)" message="취미는 1~5개까지 고를 수 있어요." />
      </DxSimpleItem>

      <DxSimpleItem data-field="religion" editor-type="dxSelectBox" :editor-options="religionOpt">
        <DxLabel text="종교" />
        <DxCustomRule
          :validation-callback="(e) => !e.value || formData.agreeSensitive"
          message="종교를 적으려면 민감정보 제공에 동의해 주세요."
        />
      </DxSimpleItem>
      <DxSimpleItem
        :visible="!admin"
        data-field="agreeSensitive"
        editor-type="dxCheckBox"
        :editor-options="opt.agreeSensitive"
        help-text="종교는 개인정보보호법상 민감정보라 따로 동의를 받아요. 동의하지 않아도 신청할 수 있어요."
        css-class="consent-sensitive"
      >
        <DxLabel :visible="false" />
      </DxSimpleItem>

      <DxSimpleItem data-field="comment" editor-type="dxTextArea" :editor-options="opt.comment" :col-span="2" :help-text="commentHelp">
        <DxLabel text="코멘트" />
        <DxStringLengthRule :max="RULES.comment.max" :message="`${RULES.comment.max}자까지 적을 수 있어요.`" />
      </DxSimpleItem>
    </DxGroupItem>

    <!-- 선호 -->
    <DxGroupItem caption="이런 분이면 좋겠어요" css-class="sec sec-pref" :col-count="2" :col-count-by-screen="{ xs: 1, sm: 2 }">
      <DxSimpleItem :visible="!readOnly" :col-span="2" template="prefNote" />

      <DxSimpleItem data-field="prefAge" editor-type="dxRangeSlider" :editor-options="opt.prefAge" :col-span="2" help-text="만 나이 기준. 양 끝 손잡이를 끌어 조절해 주세요." css-class="age-slider">
        <DxLabel text="나이" />
        <DxRequiredRule message="선호 나이를 정해주세요." />
      </DxSimpleItem>

      <DxSimpleItem data-field="prefAgeGap" template="gapTpl" :col-span="2" help-text="출생연도 기준이에요. 여러 개 고를 수 있어요.">
        <DxLabel text="연상·연하·동갑" />
      </DxSimpleItem>

      <DxSimpleItem data-field="prefFaces" template="faceTpl" :col-span="2" help-text="여러 개 고를 수 있어요. 고르지 않으면 '상관없어요'로 볼게요.">
        <DxLabel text="얼굴상" />
      </DxSimpleItem>

      <DxSimpleItem data-field="prefHeightMin" editor-type="dxSelectBox" :editor-options="opt.prefHeightMin">
        <DxLabel text="키 (부터)" />
        <DxCustomRule :validation-callback="heightRangeOk" :reevaluate="true" message="키 범위를 둘 다 고르거나 둘 다 비워주세요. 시작이 끝보다 클 수 없어요." />
      </DxSimpleItem>
      <DxSimpleItem data-field="prefHeightMax" editor-type="dxSelectBox" :editor-options="opt.prefHeightMax">
        <DxLabel text="키 (까지)" />
        <DxCustomRule :validation-callback="heightRangeOk" :reevaluate="true" message="키 범위를 둘 다 고르거나 둘 다 비워주세요." />
      </DxSimpleItem>

      <DxSimpleItem data-field="avoid" editor-type="dxTagBox" :editor-options="opt.avoid" :col-span="2" help-text="고른 범위의 분은 후보에서 빼드려요. 상대가 나를 피하도록 고른 경우에도 빠져요.">
        <DxLabel text="피하고 싶은 범위" />
      </DxSimpleItem>

      <DxSimpleItem data-field="prefDivisions" editor-type="dxTagBox" :editor-options="opt.prefDivisions">
        <DxLabel text="사업부" />
      </DxSimpleItem>
      <DxSimpleItem data-field="prefHobbies" editor-type="dxTagBox" :editor-options="opt.prefHobbies">
        <DxLabel text="취미" />
      </DxSimpleItem>
      <DxSimpleItem data-field="prefDrinking" editor-type="dxTagBox" :editor-options="opt.prefDrinking">
        <DxLabel text="음주" />
      </DxSimpleItem>
      <DxSimpleItem data-field="prefMbtis" editor-type="dxTagBox" :editor-options="opt.prefMbtis">
        <DxLabel text="MBTI" />
      </DxSimpleItem>
      <DxSimpleItem data-field="prefSmoking" editor-type="dxTagBox" :editor-options="opt.prefSmoking">
        <DxLabel text="흡연" />
      </DxSimpleItem>
      <DxSimpleItem data-field="prefBodies" editor-type="dxTagBox" :editor-options="opt.prefBodies">
        <DxLabel text="체형" />
      </DxSimpleItem>
      <DxSimpleItem data-field="prefReligions" editor-type="dxTagBox" :editor-options="prefReligionsOpt">
        <DxLabel text="종교" />
      </DxSimpleItem>

      <DxSimpleItem data-field="priorities" template="priorityTpl" :col-span="2" :help-text="`위에서 고른 선호 중 중요한 순서대로 최대 ${MAX_PRIORITIES}개. 1순위일수록 후보 추천에 크게 반영돼요.`">
        <DxLabel text="선호 우선순위" :show-colon="false" />
      </DxSimpleItem>
    </DxGroupItem>

    <!-- 동의 -->
    <DxGroupItem :visible="!admin" caption="동의" css-class="sec sec-consent">
      <DxSimpleItem template="privacyNotice" />
      <DxSimpleItem data-field="agreePrivacy" editor-type="dxCheckBox" :editor-options="opt.agreePrivacy">
        <DxLabel :visible="false" />
        <DxRequiredRule message="개인정보 수집·이용에 동의해야 신청할 수 있어요." />
      </DxSimpleItem>
      <DxSimpleItem data-field="agreeShare" editor-type="dxCheckBox" :editor-options="opt.agreeShare">
        <DxLabel :visible="false" />
        <DxRequiredRule message="정보 전달에 동의해야 매칭을 진행할 수 있어요." />
      </DxSimpleItem>
    </DxGroupItem>

    <template #basicNote>
      <p class="form-note">사내 계정 정보로 이름·성별·사업부·팀을 미리 채웠어요. 다르면 고쳐주세요.</p>
    </template>

    <template #prefNote>
      <p class="form-note">비워 둔 항목은 '상관없어요'로 볼게요. 여러 개 고를 수 있어요.</p>
    </template>

    <template #nickTpl>
      <div class="nick">
        <button type="button" class="nick__go" :disabled="nickBusy" @click="suggest">
          <i class="dx-icon-refresh" aria-hidden="true" /> {{ nickSuggestions.length ? '다시 추천' : '추천받기' }}
        </button>
        <button v-for="n in nickSuggestions" :key="n" type="button" class="nick__chip" @click="useNickname(n)">{{ n }}</button>
        <span v-if="!nickSuggestions.length" class="nick__hint">10,000개 조합 중 아직 아무도 쓰지 않은 이름을 골라드려요</span>
      </div>
    </template>

    <template #gapTpl>
      <ChipSelect :model-value="formData.prefAgeGap" :items="AGE_GAP" :read-only="readOnly" @update:model-value="(v) => setChips('prefAgeGap', v)" />
    </template>

    <template #faceTpl>
      <ChipSelect :model-value="formData.prefFaces" :items="options('FACE')" :read-only="readOnly" @update:model-value="setPrefFaces" />
    </template>

    <template #priorityTpl>
      <div ref="pickerEl">
        <PriorityPicker
          :model-value="formData.priorities"
          :available="availablePriorities"
          :read-only="readOnly"
          :error="priorityError"
          @update:model-value="setPriorities"
        />
      </div>
    </template>

    <template #privacyNotice>
      <dl class="privacy">
        <dt>필수 수집</dt>
        <dd>사번·이름(사내 인사정보), 성별, 생년월일, 사업부·팀, 키·체형·얼굴상·외모·MBTI·취미·음주·흡연, 선호 나이·우선순위</dd>
        <dt>선택 수집</dt>
        <dd>태어난 시간, 캠퍼스·건물, 사는 곳, 코멘트, 그 밖의 선호 항목 · 종교(민감정보, 별도 동의)</dd>
        <dt>이용 목적</dt>
        <dd>사내 소개팅 후보 추천·매칭, 매칭 결과 안내, 서비스 품질 관리(후기)</dd>
        <dt>상대에게 보이는 것</dt>
        <dd>후보 카드: 이름 초성, 만 나이, 사업부, 캠퍼스, 키·체형·얼굴상, MBTI, 음주·흡연, 취미 3개, 코멘트 앞부분<br />보이지 않는 것: 이름 원문, 사번, 팀, 건물, 생년월일, 외모, 종교, 사는 곳, 받은 평가</dd>
        <dt>제3자 제공</dt>
        <dd>없음 · 사내 다른 시스템이나 소속 조직에 전달하지 않아요</dd>
        <dt>보관·파기</dt>
        <dd>신청 철회 시 즉시 파기 · 매칭 종료 6개월 후 파기 · 싫어요 제재 횟수만 6개월 보관(내용 없음)</dd>
      </dl>
      <p class="privacy__note">
        동의하지 않을 수 있지만, 동의하지 않으면 신청할 수 없어요.
        <RouterLink to="/privacy" target="_blank">개인정보 처리 안내 전문 보기</RouterLink>
      </p>
    </template>
  </DxForm>
</template>

<style scoped>
.form-note {
  padding: 10px 14px;
  border-radius: var(--r-md);
  background: var(--c-blush-soft);
  color: var(--c-ink-2);
  font-size: 13.5px;
}
.privacy {
  display: grid;
  grid-template-columns: 112px 1fr;
  gap: 6px 12px;
  margin: 0;
  padding: 14px 16px;
  border: 1px solid var(--c-line);
  border-radius: var(--r-md);
  background: var(--c-paper);
  font-size: 13.5px;
}
.privacy dt {
  color: var(--c-mute);
}
.privacy dd {
  margin: 0;
  color: var(--c-ink-2);
}
.privacy__note {
  margin-top: 8px;
  color: var(--c-mute);
  font-size: 12.5px;
}
.nick {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  min-height: 40px;
}
.nick__go {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 7px 12px;
  border: 1px solid var(--c-crimson);
  border-radius: 999px;
  background: var(--c-surface);
  color: var(--c-crimson-deep);
  font: inherit;
  font-size: 13.5px;
  font-weight: 600;
  cursor: pointer;
}
.nick__go:disabled {
  opacity: 0.5;
}
.nick__chip {
  padding: 7px 12px;
  border: 1px solid var(--c-line-strong);
  border-radius: 999px;
  background: var(--c-blush-soft);
  color: var(--c-ink);
  font: inherit;
  font-size: 13.5px;
  cursor: pointer;
}
.nick__chip:hover {
  border-color: var(--c-crimson);
}
.nick__hint {
  color: var(--c-mute);
  font-size: 12.5px;
}
:deep(.age-slider .dx-rangeslider) {
  margin-top: 34px; /* 항상 보이는 툴팁 자리 */
}
:deep(.name-locked .dx-texteditor) {
  background: var(--c-paper);
}
:deep(.name-locked input) {
  color: var(--c-ink-2);
  cursor: not-allowed;
}
:deep(.time-unknown) {
  align-self: end;
  padding-bottom: 30px;
}
@media (max-width: 575px) {
  .privacy {
    grid-template-columns: 1fr;
  }
}
</style>
