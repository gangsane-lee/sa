<script setup>
/**
 * 열람 기록 — 관리자 행위만 남긴다.
 * 일반 임직원의 로그인·방문 기록은 여기에 보이지 않는다(방문 사실 자체가 민감하므로 서버 보안 로그에만 짧게 보관).
 * 기록은 수정·삭제할 수 없다.
 */
import CustomStore from 'devextreme/data/custom_store';
import {
  DxDataGrid, DxColumn, DxLookup, DxSearchPanel, DxHeaderFilter, DxPaging, DxPager, DxFilterRow,
} from 'devextreme-vue/data-grid';
import { adminApi } from '@/stores/session';
import { AUDIT_ACTIONS } from '@/constants/codes';

const store = new CustomStore({ key: 'id', load: () => adminApi.listAuditLogs() });
const CAUTION = new Set(['ADMIN_ENTER_FAIL', 'REVEAL_PII', 'EXPORT', 'DELETE_APPLICANT']);
</script>

<template>
  <div class="page">
    <p class="lead">
      담당자가 언제, 누구의 정보를 보고 바꿨는지 남는 기록이에요. 기록은 고치거나 지울 수 없어요.
      연락처 표시·내려받기·삭제·인증 실패는 강조해서 보여줘요.
    </p>
    <DxDataGrid
      class="sa-grid"
      :data-source="store"
      :show-borders="false"
      :column-auto-width="true"
      :hover-state-enabled="true"
      no-data-text="아직 기록이 없어요."
      @row-prepared="(e) => e.rowType === 'data' && CAUTION.has(e.data.action) && e.rowElement.classList.add('is-caution')"
    >
      <DxSearchPanel :visible="true" :width="220" placeholder="수행자·대상 검색" />
      <DxFilterRow :visible="true" />
      <DxHeaderFilter :visible="true" />
      <DxPaging :page-size="20" />
      <DxPager :visible="true" :show-info="true" info-text="{2}건 · {0}/{1}쪽" />

      <DxColumn data-field="at" caption="일시" data-type="datetime" format="yyyy.MM.dd HH:mm" sort-order="desc" :width="150" />
      <DxColumn data-field="action" caption="구분" :width="150">
        <DxLookup :data-source="AUDIT_ACTIONS" value-expr="value" display-expr="text" />
      </DxColumn>
      <DxColumn data-field="actorName" caption="수행자" :width="90" />
      <DxColumn data-field="actorEmpNo" caption="사번" css-class="mono-cell" :width="100" />
      <DxColumn data-field="target" caption="대상" />
      <DxColumn data-field="detail" caption="내용" />
      <DxColumn data-field="ip" caption="접속 IP" css-class="mono-cell" :width="140" />
    </DxDataGrid>
  </div>
</template>

<style scoped>
.page {
  padding: 14px 16px 10px;
  background: var(--c-surface);
  border: 1px solid var(--c-line);
  border-radius: var(--r-md);
}
.lead {
  margin-bottom: 10px;
  color: var(--c-mute);
  font-size: 13px;
}
.page :deep(.is-caution) td {
  background: #fdf3f5;
}
.page :deep(.is-caution) td:first-child {
  box-shadow: inset 3px 0 0 var(--c-crimson);
}
</style>
