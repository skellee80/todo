import { getApp } from "firebase/app";
import { getMessaging, getToken, deleteToken } from "firebase/messaging";
import { doc, setDoc, deleteDoc } from "firebase/firestore";
import { db, isFirebaseConfigured } from "./firebase";

// 파이어베이스 웹 푸시 인증서 키 (VAPID Key)
const VAPID_KEY = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY;

/**
 * 웹 푸시 서비스 워커 등록 및 FCM 토큰을 발급받아 Firestore에 저장합니다.
 */
export async function registerPushNotification(): Promise<string | null> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator) || !("Notification" in window)) {
    console.warn("이 브라우저는 웹 푸시 알림을 지원하지 않습니다.");
    return null;
  }

  if (!isFirebaseConfigured || !db) {
    console.warn("파이어베이스 설정이 활성화되지 않아 로컬 저장 모드로 푸시 요청을 생략합니다.");
    return null;
  }

  try {
    // 1. 알림 권한 획득 요청
    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      throw new Error("알림 권한 동의를 거부당했습니다.");
    }

    // 2. 서비스 워커 등록 및 환경 변수 전달
    const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "";
    const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "";
    const appId = process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "";
    const messagingSenderId = process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "";

    const swUrl = `/firebase-messaging-sw.js?apiKey=${encodeURIComponent(apiKey)}` +
      `&projectId=${encodeURIComponent(projectId)}` +
      `&appId=${encodeURIComponent(appId)}` +
      `&messagingSenderId=${encodeURIComponent(messagingSenderId)}`;

    const registration = await navigator.serviceWorker.register(swUrl, {
      scope: "/"
    });

    console.log("서비스 워커(FCM) 등록 완료:", registration);

    // 3. FCM 토큰 획득
    const firebaseApp = getApp();
    const messaging = getMessaging(firebaseApp);

    if (!VAPID_KEY) {
      console.warn("NEXT_PUBLIC_FIREBASE_VAPID_KEY 환경 변수가 제공되지 않아 FCM 토큰을 가져올 수 없습니다.");
      return null;
    }

    const token = await getToken(messaging, {
      serviceWorkerRegistration: registration,
      vapidKey: VAPID_KEY
    });

    if (token) {
      // 4. Firestore에 기기 정보 업로드
      const deviceRef = doc(db, "devices", token);
      await setDoc(deviceRef, {
        token: token,
        browser: navigator.userAgent,
        lastActive: Date.now()
      }, { merge: true });

      // 로컬 스토리지에 토큰 백업 저장 (해제할 때 사용)
      localStorage.setItem("fcm_token", token);

      console.log("기기 토큰 Firestore 등록 완료:", token);
      return token;
    } else {
      console.warn("사용자 기기 토큰 획득 실패.");
      return null;
    }
  } catch (error) {
    console.error("푸시 알림 연동 중 예외 발생:", error);
    throw error;
  }
}

/**
 * 웹 푸시 알림 연동을 해제하고 Firestore 및 브라우저에서 토큰을 제거합니다.
 */
export async function unregisterPushNotification(): Promise<boolean> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
    return false;
  }

  if (!isFirebaseConfigured || !db) {
    return false;
  }

  try {
    const firebaseApp = getApp();
    const messaging = getMessaging(firebaseApp);

    // 1. 로컬 스토리지에 저장된 토큰이 있으면 Firestore에서 먼저 삭제
    const savedToken = localStorage.getItem("fcm_token");
    if (savedToken) {
      try {
        const deviceRef = doc(db, "devices", savedToken);
        await deleteDoc(deviceRef);
        localStorage.removeItem("fcm_token");
        console.log("저장된 기기 토큰 Firestore 삭제 완료:", savedToken);
      } catch (err) {
        console.error("저장된 토큰 Firestore 삭제 오류:", err);
      }
    }

    // 2. 서비스 워커 및 브라우저 푸시 구독 취소
    const registration = await navigator.serviceWorker.getRegistration();
    if (registration) {
      // FCM 토큰을 실시간으로 가져와서 추가로 삭제 시도
      try {
        if (VAPID_KEY) {
          const token = await getToken(messaging, {
            serviceWorkerRegistration: registration,
            vapidKey: VAPID_KEY
          });
          if (token) {
            const deviceRef = doc(db, "devices", token);
            await deleteDoc(deviceRef);
            await deleteToken(messaging);
            console.log("실시간 토큰 및 FCM 삭제 완료");
          }
        }
      } catch (err) {
        console.warn("실시간 토큰 삭제 시도 실패 (이미 삭제되었거나 권한 없음):", err);
      }

      // 브라우저 푸시 구독 해제
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        await subscription.unsubscribe();
        console.log("브라우저 푸시 구독 취소 완료");
      }
    }

    return true;
  } catch (error) {
    console.error("푸시 알림 해제 중 예외 발생:", error);
    return false;
  }
}
