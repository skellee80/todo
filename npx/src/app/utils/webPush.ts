import { getApp } from "firebase/app";
import { getMessaging, getToken, deleteToken } from "firebase/messaging";
import { doc, setDoc, deleteDoc } from "firebase/firestore";
import { db, isFirebaseConfigured } from "./firebase";

// 파이어베이스 웹 푸시 인증서 키 (VAPID Key)
const VAPID_KEY = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY;

/**
 * 웹 푸시 서비스 워커 등록 및 FCM 토큰을 발급받아 Firestore에 저장합니다.
 */
export async function registerPushNotification(preference: "soyoon" | "somin" | "both" = "both"): Promise<string | null> {
  if (typeof window === "undefined") return null;

  // 1. 보안 컨텍스트(HTTPS) 검사 (개발용 localhost 및 127.0.0.1 제외)
  const isLocalhost = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
  const isSecure = window.isSecureContext;
  if (!isSecure && !isLocalhost) {
    throw new Error("INSECURE_CONTEXT");
  }

  // 2. 카카오톡 인앱 브라우저 차단
  const isKakaoTalk = /KAKAOTALK/i.test(navigator.userAgent);
  if (isKakaoTalk) {
    throw new Error("KAKAOTALK_BROWSER");
  }

  // 3. iOS 기기에서 홈 화면 추가(Standalone) 여부 검사
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
  const isStandalone = (window.navigator as any).standalone || window.matchMedia('(display-mode: standalone)').matches;
  if (isIOS && !isStandalone) {
    throw new Error("IOS_NOT_STANDALONE");
  }

  // 4. 일반 브라우저 스펙 검사
  if (!("serviceWorker" in navigator) || !("Notification" in window)) {
    throw new Error("UNSUPPORTED_BROWSER");
  }

  if (!isFirebaseConfigured || !db) {
    throw new Error("FIREBASE_NOT_CONFIGURED");
  }

  try {
    // 1. 알림 권한 획득 요청
    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      throw new Error("PERMISSION_DENIED");
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
      throw new Error("MISSING_VAPID_KEY");
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
        lastActive: Date.now(),
        alarmPreference: preference
      }, { merge: true });

      // 로컬 스토리지에 토큰 백업 저장 (해제할 때 사용) 및 수신 선호 타겟 저장
      localStorage.setItem("fcm_token", token);
      localStorage.setItem("alarm_preference", preference);

      console.log("기기 토큰 Firestore 등록 완료:", token);
      return token;
    } else {
      throw new Error("TOKEN_GENERATION_FAILED");
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

/**
 * 웹 푸시 알림 수신 대상 선호도(소윤이만, 소민이만, 둘 다)를 Firestore 및 로컬스토리지에 업데이트합니다.
 */
export async function updateAlarmPreference(preference: "soyoon" | "somin" | "both"): Promise<boolean> {
  if (typeof window === "undefined" || !isFirebaseConfigured || !db) {
    return false;
  }
  const savedToken = localStorage.getItem("fcm_token");
  if (!savedToken) {
    return false;
  }
  try {
    const deviceRef = doc(db, "devices", savedToken);
    await setDoc(deviceRef, {
      alarmPreference: preference
    }, { merge: true });
    localStorage.setItem("alarm_preference", preference);
    console.log("기기 알림 수신 선호도 변경 완료:", preference);
    return true;
  } catch (err) {
    console.error("기기 알림 선호도 업데이트 오류:", err);
    return false;
  }
}
