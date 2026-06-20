import { getApp } from "firebase/app";
import { getMessaging, getToken } from "firebase/messaging";
import { doc, setDoc } from "firebase/firestore";
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
