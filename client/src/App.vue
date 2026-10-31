<script setup>
import { isTestMode, isSsoDebug } from '@/config';
import TestModeBand from '@/components/TestModeBand.vue';
import OfficeChrome from '@/components/OfficeChrome.vue';
import { office, setOffice } from '@/stores/office';
import { session } from '@/stores/session';
</script>

<template>
  <OfficeChrome v-if="office.on && session.user" />
  <!-- 엑셀 모드 끄기 — 로그인 전후 어느 화면이든 같은 자리(오른쪽 위, 보통 화면의 '엑셀 모드' 버튼 자리)에 둔다 (Ctrl+Shift+E 도 된다) -->
  <button v-if="office.on" type="button" class="office-exit" title="보통 화면 (Ctrl+Shift+E)" @click="setOffice(false)">▦ 기본 보기</button>
  <TestModeBand v-if="isTestMode || isSsoDebug" />
  <RouterView />
</template>

<style scoped>
/* 엑셀 모드 제목 줄(높이 30px) 오른쪽 끝 — OfficeChrome 이 이 자리를 비워 둔다 */
.office-exit {
  position: fixed;
  top: 4px;
  right: 10px;
  z-index: 3000;
  height: 22px;
  padding: 0 10px;
  border: 1px solid #fff;
  border-radius: 2px;
  background: #217346;
  color: #fff;
  font: 12px/20px 'Malgun Gothic', '맑은 고딕', 'Segoe UI', sans-serif;
  cursor: pointer;
}
.office-exit:hover {
  background: #fff;
  color: #217346;
}
</style>
