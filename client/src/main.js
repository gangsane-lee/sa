import { createApp } from 'vue';
import config from 'devextreme/core/config';
import { locale, loadMessages } from 'devextreme/localization';
import koMessages from 'devextreme/localization/messages/ko.json';

// 서체는 npm 패키지로 번들 — 외부 CDN이 막힌 사내망에서도 동일하게 보인다
import '@fontsource/ibm-plex-sans-kr/400.css';
import '@fontsource/ibm-plex-sans-kr/500.css';
import '@fontsource/ibm-plex-sans-kr/600.css';
import '@fontsource/ibm-plex-sans-kr/700.css';
import '@fontsource/gowun-batang/400.css';
import '@fontsource/gowun-batang/700.css';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/500.css';

import './styles/dx.sayeon.css';
import './styles/tokens.css';
import './styles/base.css';
import './styles/dx-overrides.css';
import './styles/office.css';
import { initOffice } from './stores/office';
import { BLOCK_DEVTOOLS } from './config';
import { installGuard } from './utils/guard';

import App from './App.vue';
import router from './router';

// DevExtreme 라이선스 — src/.devextreme/license-key.js (npx devextreme-license 로 만든 파일, git 제외)
// 파일이 없으면 평가판으로 동작한다(빌드는 그대로 된다). 키는 화면이 만들어지기 전에 등록해야 한다
const licenseFile = Object.values(import.meta.glob('./.devextreme/license-key.js', { eager: true }))[0];
config({ editorStylingMode: 'outlined', ...(licenseFile?.licenseKey && { licenseKey: licenseFile.licenseKey }) });
loadMessages(koMessages);
locale('ko');

// 운영 화면: 개발자 도구 단축키·오른쪽 클릭 막기 (보조 조치 — utils/guard.js)
if (BLOCK_DEVTOOLS) installGuard();

initOffice();
createApp(App).use(router).mount('#app');
