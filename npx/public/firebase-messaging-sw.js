importScripts('https://www.gstatic.com/firebasejs/9.22.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.22.1/firebase-messaging-compat.js');

// 서비스 워커 등록 시 전달받은 URL 쿼리 스트링 파싱
const params = new URLSearchParams(location.search);
const apiKey = params.get('apiKey');
const projectId = params.get('projectId');
const appId = params.get('appId');
const messagingSenderId = params.get('messagingSenderId');

if (apiKey && projectId && messagingSenderId) {
  firebase.initializeApp({
    apiKey: apiKey,
    projectId: projectId,
    appId: appId,
    messagingSenderId: messagingSenderId
  });

  const messaging = firebase.messaging();

  // 백그라운드 메시지 수신 (알림은 브라우저가 자동 표시하므로 로그만 기록하여 중복 방지)
  messaging.onBackgroundMessage((payload) => {
    console.log('[firebase-messaging-sw.js] 백그라운드 메시지 수신:', payload);
  });
} else {
  console.warn('[firebase-messaging-sw.js] 파이어베이스 연결 구성 정보가 부족하여 초기화하지 못했습니다.');
}
