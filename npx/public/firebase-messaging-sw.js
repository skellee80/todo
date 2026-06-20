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

  // 백그라운드 푸시 메시지 수신 시 알림 표시 처리
  messaging.onBackgroundMessage((payload) => {
    console.log('[firebase-messaging-sw.js] 백그라운드 메시지 수신:', payload);
    
    const notificationTitle = payload.notification?.title || "🏡 소소한 가족의 숙제 다이어리";
    const notificationOptions = {
      body: payload.notification?.body || "숙제할 시간이 다가왔어요! 📝",
      icon: "/favicon.ico",
      badge: "/favicon.ico",
      data: payload.data
    };

    self.registration.showNotification(notificationTitle, notificationOptions);
  });
} else {
  console.warn('[firebase-messaging-sw.js] 파이어베이스 연결 구성 정보가 부족하여 초기화하지 못했습니다.');
}
