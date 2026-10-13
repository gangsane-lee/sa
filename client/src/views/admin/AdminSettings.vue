<script setup>
/** 관리자 설정 — 대시보드 표시 항목, 싫어요 제재 기준 */
import { ref, reactive, onMounted } from 'vue';
import { DxSwitch } from 'devextreme-vue/switch';
import { DxNumberBox } from 'devextreme-vue/number-box';
import { DxButton } from 'devextreme-vue/button';
import notify from 'devextreme/ui/notify';
import { adminApi } from '@/stores/session';

const f = reactive({ showDivisionRatio: true, dislikeLimit: 5, noShowCountsAsDislike: true, gatheringPopup: true, holdUntilStart: false, messageBurstLimit: 3 });
const loaded = ref(false);
const busy = ref(false);

onMounted(async () => {
  try {
    Object.assign(f, await adminApi.getSettings());
    loaded.value = true;
  } catch (e) {
    notify({ message: e.message, type: 'error', displayTime: 3500 });
  }
});

async function save() {
  busy.value = true;
  try {
    Object.assign(f, await adminApi.updateSettings({ ...f }));
    notify({ message: '설정을 저장했어요.', type: 'success', displayTime: 2000 });
  } catch (e) {
    notify({ message: e.message, type: 'error', displayTime: 3500 });
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div v-if="loaded" class="settings">
    <section class="panel">
      <h2>대시보드</h2>
      <div class="row">
        <div>
          <p class="row__title">사업부별 신청 비율 차트</p>
          <p class="row__desc">전체 신청자 중 사업부별 비율(%)을 도넛 차트로 보여줘요. 신청자가 적을 때는 특정인이 짐작될 수 있어 끌 수 있어요.</p>
        </div>
        <DxSwitch v-model:value="f.showDivisionRatio" switched-on-text="표시" switched-off-text="숨김" :width="72" />
      </div>
    </section>

    <section class="panel">
      <h2>오픈 준비 (참여자 모집)</h2>
      <div class="row">
        <div>
          <p class="row__title">'곧 매칭이 시작돼요' 팝업</p>
          <p class="row__desc">켜면 로그인할 때 한 번 두근두근 팝업을 보여줘요. 참여 인원 같은 숫자는 보여주지 않아요.</p>
        </div>
        <DxSwitch v-model:value="f.gatheringPopup" switched-on-text="켬" switched-off-text="끔" :width="72" />
      </div>
      <div class="row">
        <div>
          <p class="row__title">오픈 전 매칭 멈춤</p>
          <p class="row__desc">켜면 오늘의 인연을 보내지 않아요(신청·사주 풀이는 가능). 테스트 중에는 꺼 두세요.</p>
        </div>
        <DxSwitch v-model:value="f.holdUntilStart" switched-on-text="켬" switched-off-text="끔" :width="72" />
      </div>
    </section>

    <section class="panel">
      <h2>쪽지</h2>
      <div class="row">
        <div>
          <p class="row__title">답장 없이 연속으로 보낼 수 있는 쪽지</p>
          <p class="row__desc">상대(또는 담당자)가 답하기 전에는 이 수만큼만 연달아 보낼 수 있어요. 담당자가 보내는 쪽지는 제한 없어요.</p>
        </div>
        <DxNumberBox v-model:value="f.messageBurstLimit" :min="1" :max="20" :show-spin-buttons="true" format="#0통" :width="120" />
      </div>
    </section>

    <section class="panel">
      <h2>매칭 제외 (싫어요 제재)</h2>
      <div class="row">
        <div>
          <p class="row__title">제외 기준</p>
          <p class="row__desc">후기에서 받은 '별로였어요'가 이 횟수 이상이면 추천·하트·담당자 추천 후보에서 자동으로 빠져요. 본인에게는 알리지 않아요.</p>
        </div>
        <DxNumberBox v-model:value="f.dislikeLimit" :min="1" :max="50" :show-spin-buttons="true" format="#0회" :width="120" />
      </div>
      <div class="row">
        <div>
          <p class="row__title">노쇼 신고를 싫어요로 세기</p>
          <p class="row__desc">후기에서 '상대가 나오지 않았어요'를 고르면 평가와 별개로 싫어요 1회로 세요.</p>
        </div>
        <DxSwitch v-model:value="f.noShowCountsAsDislike" switched-on-text="켬" switched-off-text="끔" :width="72" />
      </div>
    </section>

    <div class="actions">
      <DxButton text="저장" type="default" :disabled="busy" @click="save" />
      <span class="note">바꾼 내용은 열람 기록에 남아요.</span>
    </div>
  </div>
  <div v-else class="loading" aria-busy="true" />
</template>

<style scoped>
.settings {
  display: grid;
  gap: 16px;
  max-width: 880px;
}
.panel {
  padding: 18px 20px;
  background: var(--c-surface);
  border: 1px solid var(--c-line);
  border-radius: var(--r-md);
}
.panel h2 {
  font-size: 16px;
  margin-bottom: 6px;
}
.row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 20px;
  padding: 12px 0;
  border-top: 1px solid var(--c-line);
}
.row:first-of-type {
  border-top: 0;
}
.row__title {
  font-weight: 600;
}
.row__desc {
  margin-top: 2px;
  color: var(--c-mute);
  font-size: 13px;
}
.actions {
  display: flex;
  align-items: center;
  gap: 12px;
}
.note {
  color: var(--c-mute);
  font-size: 13px;
}
.loading {
  min-height: 40vh;
}
@media (max-width: 560px) {
  .row {
    flex-direction: column;
    align-items: flex-start;
  }
}
</style>
