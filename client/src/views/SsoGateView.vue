<script setup>
/**
 * 운영 모드 입구 — 로그인 화면이 없다. 사내 인사정보로 임직원이 확인되면 바로 홈, 아니면 이 안내 화면.
 *  - 화면을 열 때 라우터가 이미 사내 인사정보 URL 로 확인을 해 본다(restoreSession). 여기서는 결과를 보여주고 '다시 확인'을 받는다
 *  - 실패 이유(session.ssoError.code)에 따라 문구를 나눈다
 *  - 사내 SSO 로그인 페이지(SSO_LOGIN_PAGE, url 방식에서만)가 있으면 '사내 SSO 로그인' 버튼을 보여준다
 * (개발 모드는 이 화면 대신 LoginView — 테스트 계정 고르기)
 */
import { ref, computed, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { DxButton } from 'devextreme-vue/button';
import { session, ssoLogin } from '@/stores/session';
import { SSO_LOGIN_PAGE } from '@/config';
import SaLogo from '@/components/SaLogo.vue';
import BadgeScene from '@/components/BadgeScene.vue';

const route = useRoute();
const router = useRouter();
const busy = ref(false);

const redirect = computed(() => (typeof route.query.redirect === 'string' && route.query.redirect.startsWith('/') ? route.query.redirect : '/'));
const goInside = () => router.replace(redirect.value);

/** 실패 이유별 안내 */
const STATES = {
  LOGGED_OUT: {
    title: '로그아웃했어요',
    lead: '사緣은 사내 인사정보로 확인된 임직원만 이용할 수 있어요. 다시 들어가려면 아래 버튼을 눌러 주세요.',
    retry: '다시 들어가기',
  },
  SSO_FAILED: {
    title: '임직원만 이용할 수 있어요',
    lead: '사緣은 DS부문 임직원 전용이에요. 지금 접속한 환경에서 사내 인사정보가 확인되지 않았어요.',
    tips: ['회사 PC에서 사내 포털(SSO)에 로그인한 상태인지', '공지된 사緣 주소로 접속했는지 (즐겨찾기·주소 확인)', '사내 포털에 다시 로그인한 뒤 [다시 확인하기]'],
    retry: '다시 확인하기',
  },
  NOT_ACTIVE_EMPLOYEE: {
    title: '재직 중인 임직원만 이용할 수 있어요',
    lead: '사내 인사정보에서 재직 중으로 확인되지 않았어요. 휴직·퇴직 상태라면 이용할 수 없어요.',
    retry: '다시 확인하기',
  },
  SSO_UNAVAILABLE: {
    title: '사내 인사정보 서버에 연결하지 못했어요',
    lead: '잠시 뒤 다시 확인해 주세요. 계속 안 되면 매칭 담당자에게 알려 주세요.',
    retry: '다시 확인하기',
  },
  SSO_NOT_CONFIGURED: {
    title: '서비스를 준비하고 있어요',
    lead: '사내 인사정보 연결을 마무리하는 중이에요. 잠시 뒤 다시 접속해 주세요.',
    note: '운영 담당자: servers.config.mjs 의 sso.employeeApi.url 을 채우고 다시 빌드해 주세요.',
    retry: '다시 확인하기',
  },
  SSO_TOO_MANY: {
    title: '잠시 뒤에 다시 시도해 주세요',
    lead: '짧은 시간에 확인 요청이 많았어요. 1분쯤 뒤에 다시 눌러 주세요.',
    retry: '다시 확인하기',
  },
};
STATES.SSO_DISABLED = STATES.SSO_NOT_CONFIGURED;

const state = computed(() => {
  const code = session.ssoError?.code;
  if (code === 'NETWORK') return { ...STATES.SSO_UNAVAILABLE, title: '사緣 서버에 연결하지 못했어요' };
  return STATES[code] ?? STATES.SSO_FAILED;
});

/** 사내 SSO 로그인 페이지 — 로그인한 뒤 사緣으로 돌아오게 {returnUrl} 을 채운다 */
const ssoLoginHref = computed(() =>
  SSO_LOGIN_PAGE ? SSO_LOGIN_PAGE.replace('{returnUrl}', encodeURIComponent(`${window.location.origin}${redirect.value}`)) : '',
);

async function retry() {
  busy.value = true;
  try {
    if (await ssoLogin()) goInside();
  } finally {
    busy.value = false;
  }
}

onMounted(() => {
  // 라우터가 SSO 확인에 성공한 뒤 이 주소로 직접 들어온 경우
  if (session.user) goInside();
  // 아직 한 번도 확인하지 않았으면(주소로 바로 들어옴) 확인부터
  else if (!session.ssoError) retry();
});
</script>

<template>
  <div class="gate">
    <section class="story">
      <SaLogo :height="40" tone="light" />
      <h1 class="story__title display">같은 캠퍼스 어딘가에<br />당신의 인연이 출근하고 있어요</h1>
      <p class="story__lead">
        사緣은 DS부문 임직원을 위한 비공개 소개팅이에요.
        緣은 '인연 연'. 회사에서 시작되는 인연을 조심스럽게 이어드려요.
      </p>
      <BadgeScene class="story__art" />
    </section>

    <section class="panel">
      <div class="card" aria-live="polite">
        <p class="card__eyebrow">임직원 전용 · 사내 인사정보 확인</p>

        <template v-if="busy && !session.ssoError">
          <h2 class="card__title">사내 인사정보를 확인하고 있어요</h2>
          <p class="card__lead">잠시만 기다려 주세요.</p>
        </template>

        <template v-else>
          <h2 class="card__title">{{ state.title }}</h2>
          <p class="card__lead">{{ state.lead }}</p>
          <ul v-if="state.tips" class="card__tips">
            <li v-for="t in state.tips" :key="t">{{ t }}</li>
          </ul>
          <p v-if="state.note" class="card__note mono">{{ state.note }}</p>

          <DxButton class="card__submit" :text="busy ? '확인하는 중…' : state.retry" type="default" width="100%" :disabled="busy" @click="retry" />
          <a v-if="ssoLoginHref" class="card__sso" :href="ssoLoginHref">사내 SSO 로그인하러 가기</a>
        </template>

        <p class="card__privacy">
          사내 인사정보는 임직원·재직 확인에만 쓰고, 비밀번호는 받지 않아요. 사緣에 들어왔다는 사실도 다른 임직원에게 알려지지 않아요.
        </p>
      </div>
    </section>
  </div>
</template>

<style scoped>
.gate {
  min-height: 100vh;
  display: grid;
  grid-template-columns: minmax(0, 1.15fr) minmax(360px, 0.85fr);
  background:
    radial-gradient(55% 60% at 30% 75%, rgba(64, 98, 235, 0.5) 0%, transparent 70%),
    var(--c-indigo);
}
.story {
  display: flex;
  flex-direction: column;
  gap: 22px;
  padding: clamp(28px, 6vw, 72px) clamp(20px, 6vw, 80px);
  color: var(--c-on-indigo);
}
.story__title {
  font-family: var(--f-body);
  font-weight: 700;
  letter-spacing: -0.03em;
  font-size: clamp(30px, 3.6vw, 46px);
  line-height: 1.26;
  margin-top: clamp(24px, 6vh, 64px);
  color: #fff;
}
.story__lead {
  max-width: 34em;
  color: var(--c-on-indigo-mute);
  font-size: 16px;
}
.story__art {
  max-width: 420px;
  margin-top: auto;
  align-self: center;
}
.panel {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 32px var(--gutter);
  background: var(--c-paper);
  border-top-left-radius: 28px;
  border-bottom-left-radius: 28px;
}
.card {
  width: 100%;
  max-width: 400px;
  display: flex;
  flex-direction: column;
}
.card__eyebrow {
  align-self: flex-start;
  padding: 2px 10px;
  border-radius: 999px;
  background: var(--c-blush);
  color: var(--c-crimson-deep);
  font-size: 12.5px;
  font-weight: 600;
}
.card__title {
  margin-top: 14px;
  font-family: var(--f-display);
  font-size: 26px;
  line-height: 1.35;
  word-break: keep-all;
}
.card__lead {
  margin-top: 10px;
  color: var(--c-ink-2);
}
.card__tips {
  margin: 14px 0 0;
  padding: 12px 14px 12px 32px;
  border-radius: var(--r-md);
  background: var(--c-surface);
  border: 1px solid var(--c-line);
  color: var(--c-ink-2);
  font-size: 14px;
  line-height: 1.7;
}
.card__note {
  margin-top: 12px;
  padding: 10px 12px;
  border-radius: var(--r-sm);
  background: var(--c-surface);
  color: var(--c-mute);
  font-size: 12px;
}
.card__submit {
  margin-top: 22px;
  height: 48px;
}
.card__submit :deep(.dx-button-text) {
  font-size: 15px;
  font-weight: 600;
}
.card__sso {
  margin-top: 12px;
  text-align: center;
  color: var(--c-crimson-deep);
  font-size: 14px;
  font-weight: 600;
}
.card__privacy {
  margin-top: 18px;
  color: var(--c-mute);
  font-size: 13px;
}
@media (max-width: 900px) {
  .gate {
    grid-template-columns: 1fr;
  }
  .story__title {
    margin-top: 8px;
  }
  .story__art {
    max-width: 420px;
    margin: 0 auto;
  }
  .panel {
    border-radius: 28px 28px 0 0;
    padding-top: 36px;
    padding-bottom: 48px;
  }
}
</style>
