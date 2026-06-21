// 알림 노티바 클릭 시 웹사이트 이동 및 기존 탭 포커싱 처리
self.addEventListener('notificationclick', (event) => {
  // FCM SDK의 기본 클릭 처리 및 중복 실행을 방지하기 위해 전파를 중단합니다.
  event.stopImmediatePropagation();
  
  event.notification.close(); // 알림 배너 닫기

  // FCM 페이로드에 포함된 타겟 링크(fcm_options.link 등) 추출
  const fcmMsg = event.notification.data?.FCM_MSG;
  const fcmLink = fcmMsg?.notification?.click_action || 
                  fcmMsg?.webpush?.fcm_options?.link ||
                  event.notification.data?.link;
  
  const targetUrl = fcmLink || (self.location.origin + '/');
  
  // URL 객체로 변환하여 호스트와 프로토콜(origin)이 맞는지 안전하게 비교 (슬래시 차이 방지)
  let targetOrigin = '';
  try {
    targetOrigin = new URL(targetUrl).origin;
  } catch (e) {
    targetOrigin = self.location.origin;
  }

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      // 1. 이미 열려 있는 사이트의 창/탭이 있는지 검사 (origin 기준)
      for (let i = 0; i < windowClients.length; i++) {
        const client = windowClients[i];
        let clientOrigin = '';
        try {
          clientOrigin = new URL(client.url).origin;
        } catch (e) {
          continue;
        }
        
        if (clientOrigin === targetOrigin && 'focus' in client) {
          // 기존 창의 URL과 다르다면 해당 URL로 이동시킨 후 포커싱
          if ('navigate' in client && client.url !== targetUrl) {
            client.navigate(targetUrl);
          }
          return client.focus(); // 기존 창을 활성화하여 앞으로 가져옵니다.
        }
      }
      // 2. 열려 있는 창이 없다면 새 창으로 타겟 URL 열기
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});

// 서비스 워커 업데이트 즉시 반영 설정 (새 버전이 배포되었을 때 대기하지 않고 즉시 활성화)
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim());
});

// 파이어베이스 라이브러리 로드
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

  // 백그라운드 메시지 수신 시 모바일 등 일부 브라우저에서 알림이 누락되지 않도록 명시적으로 알림창을 띄워줍니다.
  messaging.onBackgroundMessage((payload) => {
    console.log('[firebase-messaging-sw.js] 백그라운드 메시지 수신:', payload);
    
    const title = payload.notification?.title || '⏰ 숙제 다이어리 알림';
    const body = payload.notification?.body || '오늘 완료할 숙제가 있습니다.';
    const icon = payload.notification?.image || payload.data?.icon || '/favicon.ico';
    const badge = '/favicon.ico';
    const link = payload.data?.link || payload.notification?.click_action || '/';

    const notificationOptions = {
      body: body,
      icon: icon,
      badge: badge,
      data: {
        link: link
      }
    };

    return self.registration.showNotification(title, notificationOptions);
  });
} else {
  console.warn('[firebase-messaging-sw.js] 파이어베이스 연결 구성 정보가 부족하여 초기화하지 못했습니다.');
}
