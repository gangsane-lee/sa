<script setup>
/**
 * 신청서 폼 — 신청자 화면(ApplyView)과 관리자 상세/수정 팝업이 함께 쓴다.
 * 유효성 기준은 utils/applicationRules.js 의 RULES (서버 검증과 동일).
 */
import { ref, computed } from 'vue';
import {
  DxForm, DxGroupItem, DxSimpleItem, DxLabel, DxColCountByScreen,
  DxRequiredRule, DxPatternRule, DxRangeRule, DxStringLengthRule, DxEmailRule, DxCustomRule,
} from 'devextreme-vue/form';
import notify from 'devextreme/ui/notify';
// 모듈 방식에서는 DxForm이 editorType으로 쓰는 편집기를 직접 등록해야 한다 (E1035 방지)
import 'devextreme/ui/radio_group';
import 'devextreme/ui/number_box';
import 'devextreme/ui/select_box';
import 'devextreme/ui/tag_box';
import 'devextreme/ui/text_area';
import 'devextreme/ui/check_box';
import 'devextreme/ui/range_slider';
import {
  GENDERS, DIVISIONS, CAREER_LEVELS, WORK_SITES, WORK_PATTERNS, BODY_TYPES, EDUCATIONS, RELIGIONS,
  SMOKING, DRINKING, MBTIS, HOBBIES, PERSONALITIES, IDEAL_KEYWORDS, PREF_SMOKING, MEETING_STYLES, AVOID_SCOPES,
} from '@/constants/codes';
import { RULES, ageOf } from '@/utils/applicationRules';

const props = defineProps({
  formData: { type: Object, required: true },
  readOnly: { type: Boolean, default: false },
  /** 관리자 화면: 동의 항목과 안내 문구를 숨긴다 */
  admin: { type: Boolean, default: false },
});
const emit = defineEmits(['change']);

const formRef = ref();
defineExpose({
  validate: () => formRef.value.instance.validate(),
});

// ── 편집기 옵션 ────────────────────────────────────────
const select = (items, placeholder, extra = {}) => ({
  items, valueExpr: 'value', displayExpr: 'text', placeholder, ...extra,
});
const radios = (items) => ({ items, valueExpr: 'value', displayExpr: 'text', layout: 'horizontal' });
const tags = (items, placeholder, extra = {}) => ({
  items, placeholder, searchEnabled: true, hideSelectedItems: true, multiline: true,
  showDropDownButton: true, applyValueMode: 'instantly', ...extra,
});

const LIMITS = { hobbies: RULES.hobbies.max, personality: RULES.personality.max, prefKeywords: RULES.prefKeywords.max };
const countBetween = ({ min, max }) => (e) => Array.isArray(e.value) && e.value.length >= min && e.value.length <= max;
const hobbyLength = (e) => (e.value ?? []).every((h) => String(h).trim().length >= 1 && String(h).trim().length <= 15);

const opt = {
  name: { placeholder: '예: 홍길동', maxLength: 30 },
  gender: radios(GENDERS),
  birthYear: { placeholder: '예: 1994', format: '#0', showSpinButtons: false, mode: 'number' },
  division: select(DIVISIONS, '사업부를 골라주세요'),
  dept: { placeholder: '예: DRAM설계팀', maxLength: 30 },
  careerLevel: radios(CAREER_LEVELS),
  workSite: select(WORK_SITES, '근무지를 골라주세요'),
  workPattern: radios(WORK_PATTERNS),
  phone: {
    mask: '000-0000-0000', maskChar: '_', useMaskedValue: true, showMaskMode: 'onFocus', mode: 'tel',
    placeholder: '예: 010-1234-5678', maskInvalidMessage: '휴대전화 번호 11자리를 모두 입력해 주세요.',
  },
  email: { placeholder: '예: gildong.hong@samsung.com', maxLength: 100, mode: 'email' },

  height: { placeholder: '예: 172', format: '#0', showSpinButtons: false, mode: 'number' },
  bodyType: select(BODY_TYPES, '체형을 골라주세요'),
  residence: { placeholder: '예: 화성 동탄', maxLength: 30 },
  education: select(EDUCATIONS, '선택 안 함', { showClearButton: true }),
  smoking: radios(SMOKING),
  drinking: radios(DRINKING),
  mbti: select(MBTIS, '예: ENFP', { showClearButton: true, searchEnabled: true }),
  agreeSensitive: { text: '종교 정보 제공에 동의해요 (민감정보 · 선택)' },
  hobbies: tags(HOBBIES, '예: 러닝, 맛집 탐방 (목록에 없으면 입력 후 Enter)', { acceptCustomValue: true }),
  personality: tags(PERSONALITIES, '예: 다정한, 유머러스한'),
  intro: {
    height: 150, maxLength: RULES.intro.max,
    placeholder:
      '예: 평일엔 화성캠퍼스에서 공정 데이터를 들여다보고, 주말엔 동탄 호수공원을 달려요. 맛있는 국밥집을 찾으면 꼭 누군가에게 알려주고 싶어지는 사람이에요.',
  },

  prefAge: {
    min: RULES.prefAge.min, max: RULES.prefAge.max,
    tooltip: { enabled: true, showMode: 'onHover', format: (v) => `${v}세` },
  },
  prefKeywords: tags(IDEAL_KEYWORDS, '예: 대화가 잘 통하는, 잘 웃는'),
  prefSmoking: radios(PREF_SMOKING),
  meetingStyle: radios(MEETING_STYLES),
  avoidScope: radios(AVOID_SCOPES),
  messageToManager: {
    height: 90, maxLength: RULES.messageToManager.max,
    placeholder: '예: 교대 근무라 일정은 미리 맞추는 게 편해요. 대화가 잘 통하는 분이면 좋겠어요.',
  },

  agreePrivacy: { text: '[필수] 개인정보 수집·이용에 동의해요' },
  agreeShare: { text: '[필수] 서로 수락한 경우에만 이름·소속·연락처가 상대에게 전달되는 것에 동의해요' },
};

const religionOpt = computed(() =>
  select(RELIGIONS, props.formData.agreeSensitive ? '종교를 골라주세요' : '위 민감정보 동의 후 입력할 수 있어요', {
    showClearButton: true,
    disabled: !props.formData.agreeSensitive && !props.readOnly,
  }),
);

// ── 동적 도움말 ────────────────────────────────────────
const ageHelp = computed(() => {
  const y = props.formData.birthYear;
  const age = ageOf(y);
  return age && y >= RULES.birthYear.min && y <= RULES.birthYear.max
    ? `${String(y).slice(2)}년생 · 올해 ${age}세`
    : '4자리로 적어주세요. 나이는 자동으로 계산돼요.';
});
const introHelp = computed(() => {
  const n = (props.formData.intro ?? '').trim().length;
  return `${RULES.intro.min}~${RULES.intro.max}자 · 지금 ${n}자`;
});
const prefAgeHelp = computed(() => {
  const [min, max] = props.formData.prefAge ?? [];
  return `${min}세 ~ ${max}세 사이의 분을 찾아볼게요. 양 끝 손잡이를 끌어 조절해 주세요.`;
});

function onFieldDataChanged(e) {
  const form = formRef.value?.instance;
  if (e.dataField === 'agreeSensitive' && !e.value) form?.updateData('religion', null);
  const limit = LIMITS[e.dataField];
  if (limit && Array.isArray(e.value) && e.value.length > limit) {
    form?.updateData(e.dataField, e.value.slice(0, limit));
    notify({ message: `최대 ${limit}개까지 고를 수 있어요.`, type: 'warning', displayTime: 1800 });
  }
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
  >
    <!-- 기본 정보 -->
    <DxGroupItem caption="기본 정보" css-class="sec sec-basic" :col-count="2">
      <DxColCountByScreen :xs="1" :sm="2" />
      <DxSimpleItem :visible="!admin && !readOnly" :col-span="2" template="basicNote" />

      <DxSimpleItem data-field="name" :editor-options="opt.name" help-text="매칭이 성사되기 전까지 상대에게 공개되지 않아요.">
        <DxLabel text="이름" />
        <DxRequiredRule message="이름을 입력해 주세요." />
        <DxPatternRule :pattern="RULES.name.pattern" :message="RULES.name.message" />
      </DxSimpleItem>
      <DxSimpleItem data-field="gender" editor-type="dxRadioGroup" :editor-options="opt.gender">
        <DxLabel text="성별" />
        <DxRequiredRule message="성별을 골라주세요." />
      </DxSimpleItem>

      <DxSimpleItem data-field="birthYear" editor-type="dxNumberBox" :editor-options="opt.birthYear" :help-text="ageHelp">
        <DxLabel text="출생연도" />
        <DxRequiredRule message="출생연도를 입력해 주세요." />
        <DxRangeRule
          :min="RULES.birthYear.min"
          :max="RULES.birthYear.max"
          :message="`${RULES.birthYear.min}~${RULES.birthYear.max}년 사이로 입력해 주세요.`"
        />
      </DxSimpleItem>
      <DxSimpleItem data-field="division" editor-type="dxSelectBox" :editor-options="opt.division">
        <DxLabel text="사업부" />
        <DxRequiredRule message="사업부를 골라주세요." />
      </DxSimpleItem>

      <DxSimpleItem data-field="dept" :editor-options="opt.dept" help-text="팀·그룹 이름까지만 적어도 충분해요.">
        <DxLabel text="소속" />
        <DxRequiredRule message="소속을 입력해 주세요." />
        <DxPatternRule :pattern="RULES.dept.pattern" :message="RULES.dept.message" />
      </DxSimpleItem>
      <DxSimpleItem data-field="careerLevel" editor-type="dxRadioGroup" :editor-options="opt.careerLevel">
        <DxLabel text="직급" />
        <DxRequiredRule message="직급(CL)을 골라주세요." />
      </DxSimpleItem>

      <DxSimpleItem data-field="workSite" editor-type="dxSelectBox" :editor-options="opt.workSite">
        <DxLabel text="근무지" />
        <DxRequiredRule message="근무지를 골라주세요." />
      </DxSimpleItem>
      <DxSimpleItem
        data-field="workPattern"
        editor-type="dxRadioGroup"
        :editor-options="opt.workPattern"
        help-text="교대 근무라면 일정이 맞는 분을 우선 찾아볼게요."
      >
        <DxLabel text="근무 형태" />
        <DxRequiredRule message="근무 형태를 골라주세요." />
      </DxSimpleItem>

      <DxSimpleItem data-field="phone" :editor-options="opt.phone" help-text="서로 수락한 뒤에만 상대에게 전달돼요.">
        <DxLabel text="휴대전화" />
        <DxRequiredRule message="휴대전화 번호를 입력해 주세요." />
        <DxPatternRule :pattern="RULES.phone.pattern" :message="RULES.phone.message" />
      </DxSimpleItem>
      <DxSimpleItem
        data-field="email"
        :editor-options="opt.email"
        help-text="매칭 소식을 받을 주소예요. 사내 메일이 부담스러우면 개인 메일도 괜찮아요."
      >
        <DxLabel text="이메일" />
        <DxRequiredRule message="이메일을 입력해 주세요." />
        <DxEmailRule message="이메일 형식이 맞지 않아요. 예: gildong.hong@samsung.com" />
        <DxStringLengthRule :max="RULES.email.max" message="이메일은 100자까지 입력할 수 있어요." />
      </DxSimpleItem>
    </DxGroupItem>

    <!-- 나를 소개해요 -->
    <DxGroupItem caption="나를 소개해요" css-class="sec sec-profile" :col-count="2">
      <DxColCountByScreen :xs="1" :sm="2" />

      <DxSimpleItem data-field="height" editor-type="dxNumberBox" :editor-options="opt.height" help-text="cm 단위로 적어주세요.">
        <DxLabel text="키" />
        <DxRequiredRule message="키를 입력해 주세요." />
        <DxRangeRule :min="RULES.height.min" :max="RULES.height.max" message="140~210cm 사이로 입력해 주세요." />
      </DxSimpleItem>
      <DxSimpleItem data-field="bodyType" editor-type="dxSelectBox" :editor-options="opt.bodyType">
        <DxLabel text="체형" />
        <DxRequiredRule message="체형을 골라주세요." />
      </DxSimpleItem>

      <DxSimpleItem data-field="residence" :editor-options="opt.residence" help-text="시·구 정도면 충분해요. 동·호수는 적지 마세요.">
        <DxLabel text="거주 지역" />
        <DxRequiredRule message="거주 지역을 입력해 주세요." />
        <DxStringLengthRule :min="RULES.residence.min" :max="RULES.residence.max" message="2~30자로 입력해 주세요." />
      </DxSimpleItem>
      <DxSimpleItem data-field="education" editor-type="dxSelectBox" :editor-options="opt.education">
        <DxLabel text="최종 학력" />
      </DxSimpleItem>

      <DxSimpleItem data-field="smoking" editor-type="dxRadioGroup" :editor-options="opt.smoking">
        <DxLabel text="흡연" />
        <DxRequiredRule message="흡연 여부를 골라주세요." />
      </DxSimpleItem>
      <DxSimpleItem data-field="drinking" editor-type="dxRadioGroup" :editor-options="opt.drinking">
        <DxLabel text="음주" />
        <DxRequiredRule message="음주 스타일을 골라주세요." />
      </DxSimpleItem>

      <DxSimpleItem data-field="mbti" editor-type="dxSelectBox" :editor-options="opt.mbti">
        <DxLabel text="MBTI" />
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
        :col-span="2"
        help-text="종교는 개인정보보호법상 민감정보라 따로 동의를 받아요. 동의하지 않아도 신청할 수 있어요."
      >
        <DxLabel :visible="false" />
      </DxSimpleItem>

      <DxSimpleItem
        data-field="hobbies"
        editor-type="dxTagBox"
        :editor-options="opt.hobbies"
        :col-span="2"
        :help-text="`${RULES.hobbies.min}~${RULES.hobbies.max}개 · 같은 취미가 많을수록 매칭에 유리해요.`"
      >
        <DxLabel text="취미·관심사" />
        <DxRequiredRule message="취미를 1개 이상 골라주세요." />
        <DxCustomRule :validation-callback="countBetween(RULES.hobbies)" message="취미는 1~5개까지 고를 수 있어요." />
        <DxCustomRule :validation-callback="hobbyLength" message="직접 입력한 취미는 15자 이내로 적어주세요." />
      </DxSimpleItem>
      <DxSimpleItem
        data-field="personality"
        editor-type="dxTagBox"
        :editor-options="opt.personality"
        :col-span="2"
        help-text="나를 가장 잘 나타내는 말로 1~3개 골라주세요."
      >
        <DxLabel text="성격 키워드" />
        <DxRequiredRule message="성격 키워드를 1개 이상 골라주세요." />
        <DxCustomRule :validation-callback="countBetween(RULES.personality)" message="성격 키워드는 1~3개까지 고를 수 있어요." />
      </DxSimpleItem>
      <DxSimpleItem data-field="intro" editor-type="dxTextArea" :editor-options="opt.intro" :col-span="2" :help-text="introHelp">
        <DxLabel text="자기소개" />
        <DxRequiredRule message="자기소개를 적어주세요." />
        <DxStringLengthRule
          :min="RULES.intro.min"
          :max="RULES.intro.max"
          :trim="true"
          message="자기소개는 30자 이상 500자 이하로 적어주세요."
        />
      </DxSimpleItem>
    </DxGroupItem>

    <!-- 이상형 -->
    <DxGroupItem caption="이런 분을 만나고 싶어요" css-class="sec sec-ideal" :col-count="2">
      <DxColCountByScreen :xs="1" :sm="2" />

      <DxSimpleItem data-field="prefAge" editor-type="dxRangeSlider" :editor-options="opt.prefAge" :col-span="2" :help-text="prefAgeHelp">
        <DxLabel text="선호 나이" />
        <DxRequiredRule message="선호 나이를 정해주세요." />
      </DxSimpleItem>
      <DxSimpleItem
        data-field="prefKeywords"
        editor-type="dxTagBox"
        :editor-options="opt.prefKeywords"
        :col-span="2"
        help-text="1~5개 · 담당자가 가장 먼저 보는 항목이에요."
      >
        <DxLabel text="이상형 키워드" />
        <DxRequiredRule message="이상형 키워드를 1개 이상 골라주세요." />
        <DxCustomRule :validation-callback="countBetween(RULES.prefKeywords)" message="이상형 키워드는 1~5개까지 고를 수 있어요." />
      </DxSimpleItem>

      <DxSimpleItem data-field="prefSmoking" editor-type="dxRadioGroup" :editor-options="opt.prefSmoking">
        <DxLabel text="상대의 흡연" />
        <DxRequiredRule message="상대의 흡연 여부 선호를 골라주세요." />
      </DxSimpleItem>
      <DxSimpleItem data-field="meetingStyle" editor-type="dxRadioGroup" :editor-options="opt.meetingStyle">
        <DxLabel text="편한 첫 만남" />
        <DxRequiredRule message="편한 첫 만남 방식을 골라주세요." />
      </DxSimpleItem>

      <DxSimpleItem
        data-field="avoidScope"
        editor-type="dxRadioGroup"
        :editor-options="opt.avoidScope"
        :col-span="2"
        help-text="매일 마주치는 사이는 부담스러울 수 있으니까요. 고른 범위의 분은 추천에서 빼드려요."
      >
        <DxLabel text="매칭에서 제외할 범위" />
        <DxRequiredRule message="매칭에서 제외할 범위를 골라주세요." />
      </DxSimpleItem>
      <DxSimpleItem data-field="messageToManager" editor-type="dxTextArea" :editor-options="opt.messageToManager" :col-span="2">
        <DxLabel text="담당자에게 한마디" />
        <DxStringLengthRule :max="RULES.messageToManager.max" message="300자까지 적을 수 있어요." />
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
      <p class="form-note">인사 정보로 이름·사업부·소속·직급·근무지를 미리 채웠어요. 다르면 고쳐주세요.</p>
    </template>

    <template #privacyNotice>
      <dl class="privacy">
        <dt>수집 항목</dt>
        <dd>이름, 사번, 성별, 출생연도, 사업부·소속·직급·근무지, 연락처, 프로필(키·체형·거주 지역·취미 등), 이상형 정보</dd>
        <dt>이용 목적</dt>
        <dd>사내 소개팅 매칭과 결과 안내</dd>
        <dt>보관 기간</dt>
        <dd>신청 철회 시 즉시 파기 · 매칭 종료 후 6개월이 지나면 파기</dd>
      </dl>
      <p class="privacy__note">동의하지 않을 수 있지만, 동의하지 않으면 신청할 수 없어요.</p>
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
  grid-template-columns: 76px 1fr;
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
</style>
