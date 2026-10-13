/**
 * 요청마다 따로 쓰는 값(세션·접속 IP)을 서비스 코드에 넘겨주는 통로.
 * 서비스(core/service.js)는 화면과 같이 쓰는 코드라 Express 요청 객체를 모르므로, 여기서 꺼내 준다.
 */
import { AsyncLocalStorage } from 'node:async_hooks';

const als = new AsyncLocalStorage();

export const runWithRequest = (req, fn) => als.run({ req }, fn);
export const currentReq = () => als.getStore()?.req ?? null;
