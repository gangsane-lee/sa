<script setup>
import { isTestMode, isSsoDebug } from '@/config';
import TestModeBand from '@/components/TestModeBand.vue';
import OfficeChrome from '@/components/OfficeChrome.vue';
import { office } from '@/stores/office';
import { session } from '@/stores/session';
</script>

<template>
  <OfficeChrome v-if="office.on && session.user" />
  <TestModeBand v-if="isTestMode || isSsoDebug" />
  <RouterView />
</template>
