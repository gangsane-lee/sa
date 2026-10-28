<script setup>
/**
 * 관리자: 신청자 상세 보기 / 수정 / 삭제
 * 열 때마다 서버에 '상세 열람' 기록이 남는다.
 */
import { ref, reactive, computed, watch, nextTick } from 'vue';
import { DxPopup, DxToolbarItem } from 'devextreme-vue/popup';
import { DxScrollView } from 'devextreme-vue/scroll-view';
import { DxSelectBox } from 'devextreme-vue/select-box';
import { DxTextArea } from 'devextreme-vue/text-area';
import notify from 'devextreme/ui/notify';
import { confirm } from 'devextreme/ui/dialog';
import 'devextreme/ui/button'; // 팝업 툴바의 widget: 'dxButton'
import { adminApi } from '@/stores/session';
import { APPLY_STATUS, MANUAL_APPLY_STATUS, GENDERS, USER_STATUS_MAP, textOf } from '@shared/constants/codes';
import { ct } from '@/stores/codes';
import { toFormModel, fromFormModel } from '@shared/utils/applicationModel';
import { fmtDateTime } from '@shared/utils/format';
import ApplicantForm from './ApplicantForm.vue';
import StatusBadge from './StatusBadge.vue';

const props = defineProps({
  applicantId: { type: Number, default: null },
  startInEdit: { type: Boolean, default: false },
});
const emit = defineEmits(['saved', 'deleted', 'find-match']);
const visible = defineModel('visible', { type: Boolean, default: false });

const app = ref(null);
const form = ref(null);
const manage = reactive({ status: null, adminMemo: '' });
const editing = ref(false);
const busy = ref(false);
const formComp = ref();

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

async function load() {
  app.value = null;
  form.value = null;
  try {
    const a = await adminApi.getApplicant(props.applicantId);
    app.value = a;
    form.value = reactive(toFormModel(a));
    manage.status = a.status;
    manage.adminMemo = a.adminMemo ?? '';
    editing.value = props.startInEdit;
  } catch (e) {
    notify({ message: e.message, type: 'error', displayTime: 3500 });
    visible.value = false;
  }
}

watch(visible, (v) => {
  if (v && props.applicantId) load();
});

const title = computed(() => (app.value ? `${app.value.name} · 신청 #${app.value.id}` : '신청자 정보'));
/** 직접 고를 수 있는 상태만 열어 두고, 매칭에서 정해지는 상태는 지금 값일 때만 보여준다 */
const statusItems = computed(() =>
  APPLY_STATUS.filter((s) => MANUAL_APPLY_STATUS.includes(s.value) || s.value === app.value?.status).map((s) => ({
    ...s,
    disabled: !MANUAL_APPLY_STATUS.includes(s.value),
  })),
);

/**
 * 보기↔수정 전환·저장 때 폼이 통째로 다시 그려지면서 스크롤이 맨 위로 튀던 문제 —
 * 바꾸기 전 위치를 기억했다가 다시 그려진 뒤 되돌린다
 */
const svRef = ref();
async function keepScroll(change) {
  const sv = svRef.value?.instance;
  const top = sv?.scrollTop() ?? 0;
  await change();
  await nextTick();
  // DxForm이 편집기를 다시 만들고 높이가 잡힌 뒤에 되돌린다
  requestAnimationFrame(() => setTimeout(() => sv?.scrollTo({ top }), 60));
}

function startEdit() {
  keepScroll(() => (editing.value = true));
}

function cancelEdit() {
  keepScroll(() => {
    form.value = reactive(toFormModel(app.value));
    manage.status = app.value.status;
    manage.adminMemo = app.value.adminMemo ?? '';
    editing.value = false;
  });
}

async function save() {
  const result = formComp.value.validate();
  if (!result.isValid) {
    notify({ message: `확인이 필요한 항목이 ${result.count}개 있어요.`, type: 'warning', displayTime: 2500 });
    result.focus();
    return;
  }
  busy.value = true;
  try {
    const { agreePrivacy, agreeShare, agreeSensitive, ...profile } = fromFormModel(form.value);
    const updated = await adminApi.updateApplicant(app.value.id, { ...profile, ...manage });
    await keepScroll(() => {
      app.value = updated;
      form.value = reactive(toFormModel(updated));
      editing.value = false;
    });
    notify({ message: '신청자 정보를 저장했어요.', type: 'success', displayTime: 2000 });
    emit('saved');
  } catch (e) {
    notify({ message: e.message, type: 'error', displayTime: 4000 });
  } finally {
    busy.value = false;
  }
}

async function remove() {
  const ok = await confirm(
    `<b>${esc(app.value.name)}</b>님의 신청서와 매칭 내역을 완전히 삭제할까요?<br>삭제하면 되돌릴 수 없어요.`,
    '신청자 삭제',
  );
  if (!ok) return;
  try {
    await adminApi.deleteApplicant(app.value.id);
    notify({ message: '신청자를 삭제했어요.', type: 'success', displayTime: 2000 });
    visible.value = false;
    emit('deleted');
  } catch (e) {
    notify({ message: e.message, type: 'error', displayTime: 4000 });
  }
}

function findMatch() {
  visible.value = false;
  emit('find-match', app.value.id);
}
</script>

<template>
  <DxPopup
    v-model:visible="visible"
    :title="title"
    :width="960"
    max-width="calc(100vw - 24px)"
    height="92vh"
    :show-close-button="true"
    :hide-on-outside-click="!editing"
    :drag-enabled="false"
    :wrapper-attr="{ class: 'sa-popup' }"
  >
    <DxScrollView ref="svRef">
      <!-- DxScrollView는 처음 받은 노드만 스크롤 영역 안으로 옮긴다. v-if 전환 노드가 밖으로 빠지지 않도록 고정 래퍼로 감싼다 -->
      <div class="detail-wrap">
        <div v-if="app && form" class="detail">
          <section class="summary">
            <div>
              <p class="summary__who">
                <b>{{ app.name }}</b>
                {{ textOf(GENDERS, app.gender) }} · {{ app.birthYear }}년생({{ app.age }}세) ·
                {{ ct('DIVISION', app.division) }} {{ app.team }}
                <template v-if="app.campus"> · {{ ct('CAMPUS', app.campus) }}{{ app.building ? ` ${app.building}` : '' }}</template>
              </p>
              <p class="summary__meta mono">
                사번 {{ app.empNo }} · 신청 {{ fmtDateTime(app.createdAt) }} · 마지막 수정 {{ fmtDateTime(app.updatedAt) }} ·
                본인 화면: {{ USER_STATUS_MAP[app.userStatus]?.text }}
              </p>
            </div>
            <div class="summary__consents">
              <span class="chip">개인정보 수집·이용 동의</span>
              <span class="chip">하트 맞교환 시 정보 전달 동의</span>
              <span class="chip" :class="{ 'chip--off': !app.agreeSensitive }">
                민감정보(종교) {{ app.agreeSensitive ? '동의' : '미동의' }}
              </span>
            </div>
          </section>

          <section class="manage" :class="{ 'is-editing': editing }">
            <div class="manage__field">
              <label for="manage-status">상태</label>
              <DxSelectBox
                v-if="editing"
                v-model:value="manage.status"
                :items="statusItems"
                value-expr="value"
                display-expr="text"
                :input-attr="{ id: 'manage-status' }"
              />
              <StatusBadge v-else :status="manage.status" />
              <small v-if="editing" class="manage__hint">매칭 중·매칭 완료·커플 완료는 매칭 관리에서 바뀌어요</small>
            </div>
            <div class="manage__field manage__field--grow">
              <label for="manage-memo">관리 메모 <span>· 신청자 본인에게도 보이지 않아요</span></label>
              <DxTextArea
                v-model:value="manage.adminMemo"
                :read-only="!editing"
                :max-length="300"
                :height="64"
                placeholder="예: 10/1 통화 — 주말 일정 선호"
                :input-attr="{ id: 'manage-memo' }"
              />
            </div>
          </section>

          <ApplicantForm ref="formComp" :form-data="form" :read-only="!editing" admin />
        </div>
        <div v-else class="detail detail--loading" aria-busy="true" />
      </div>
    </DxScrollView>

    <DxToolbarItem
      toolbar="bottom"
      location="before"
      widget="dxButton"
      :visible="Boolean(app) && !editing"
      :options="{ text: '삭제', icon: 'trash', stylingMode: 'text', type: 'danger', onClick: remove }"
    />
    <DxToolbarItem
      toolbar="bottom"
      location="before"
      widget="dxButton"
      :visible="Boolean(app) && !editing"
      :options="{ text: '매칭 후보 보기', icon: 'link', stylingMode: 'text', onClick: findMatch }"
    />
    <DxToolbarItem
      toolbar="bottom"
      location="after"
      widget="dxButton"
      :visible="!editing"
      :options="{ text: '닫기', stylingMode: 'outlined', onClick: () => (visible = false) }"
    />
    <DxToolbarItem
      toolbar="bottom"
      location="after"
      widget="dxButton"
      :visible="Boolean(app) && !editing"
      :options="{ text: '수정하기', icon: 'edit', type: 'default', onClick: startEdit }"
    />
    <DxToolbarItem
      toolbar="bottom"
      location="after"
      widget="dxButton"
      :visible="editing"
      :options="{ text: '취소', stylingMode: 'outlined', onClick: cancelEdit }"
    />
    <DxToolbarItem
      toolbar="bottom"
      location="after"
      widget="dxButton"
      :visible="editing"
      :options="{ text: '저장', type: 'default', disabled: busy, onClick: save }"
    />
  </DxPopup>
</template>

<style scoped>
.detail {
  padding: 4px 4px 24px;
}
.detail--loading {
  min-height: 60vh;
}
.summary {
  display: flex;
  justify-content: space-between;
  gap: 12px 24px;
  flex-wrap: wrap;
  padding-bottom: 16px;
  border-bottom: 1px solid var(--c-line);
}
.summary__who {
  color: var(--c-ink-2);
}
.summary__who b {
  margin-right: 8px;
  font-size: 20px;
  color: var(--c-indigo);
}
.summary__meta {
  margin-top: 4px;
  color: var(--c-mute);
  font-size: 12px;
}
.summary__consents {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-content: flex-start;
}
.chip--off {
  background: #f1f1f4;
  border-color: #e4e4ea;
  color: var(--c-mute);
}

.manage {
  display: flex;
  gap: 16px;
  flex-wrap: wrap;
  margin: 16px 0 20px;
  padding: 14px 16px;
  border-radius: var(--r-md);
  background: #f6edd6;
}
.manage.is-editing {
  outline: 2px solid rgba(107, 78, 0, 0.25);
}
.manage__field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 160px;
}
.manage__field--grow {
  flex: 1;
  min-width: 240px;
}
.manage label {
  font-size: 13px;
  font-weight: 600;
  color: var(--c-moon-ink);
}
.manage label span {
  font-weight: 400;
}
.manage__hint {
  color: var(--c-moon-ink);
  font-size: 11.5px;
  opacity: 0.8;
}
</style>
