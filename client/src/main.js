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

import App from './App.vue';
import router from './router';

config({ editorStylingMode: 'outlined' });
loadMessages(koMessages);
locale('ko');

createApp(App).use(router).mount('#app');
