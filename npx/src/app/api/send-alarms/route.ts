import { NextRequest, NextResponse } from "next/server";
import { getApps, getApp, initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getMessaging } from "firebase-admin/messaging";

let adminDb: any = null;
let adminMessaging: any = null;

try {
  // 파이어베이스 어드민 초기화 (서버 가동 용도)
  if (getApps().length === 0) {
    const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (serviceAccount) {
      // 로컬/비서버 환경용 명시적 서비스 계정 주입 설정
      initializeApp({
        credential: cert(JSON.parse(serviceAccount))
      });
    } else {
      // 파이어베이스 앱 호스팅(구글 Cloud Run) 환경에서는 기본 서비스 계정 자격이 자동 연동됨
      initializeApp();
    }
  }
  const app = getApp();
  adminDb = getFirestore(app);
  adminMessaging = getMessaging(app);
} catch (e) {
  console.warn("파이어베이스 어드민 SDK 초기화 경고 (환경 변수가 없어 데모 모드로 실행됩니다):", e);
}

export async function GET(req: NextRequest) {
  // 보안 검사: 외부 크론 스케줄러가 아닌 임의 호출 방지를 위해 간단한 인증 키 확인 설정 가능
  if (!adminDb || !adminMessaging) {
    return NextResponse.json(
      { success: false, message: "파이어베이스 어드민이 활성화되지 않은 로컬 모드 상태입니다." },
      { status: 500 }
    );
  }

  try {
    // 1. 아시아/서울 타임존 기준 정확한 한국 표준시(KST, UTC+9) 시간 구하기 (서버 환경에 무관)
    const now = new Date();
    const kstDate = new Date(now.getTime() + (9 * 60 * 60 * 1000));

    const y = kstDate.getUTCFullYear();
    const m = String(kstDate.getUTCMonth() + 1).padStart(2, "0");
    const d = String(kstDate.getUTCDate()).padStart(2, "0");
    const dateStr = `${y}-${m}-${d}`;

    const currentHour = kstDate.getUTCHours();
    const currentMin = kstDate.getUTCMinutes();
    const currentMinutesKST = currentHour * 60 + currentMin;
    const dayOfWeek = kstDate.getUTCDay(); // 0(일)~6(토)

    console.log(`[send-alarms] 한국 시간 체크: ${dateStr} ${currentHour}:${currentMin} (요일코드: ${dayOfWeek})`);

    // 2. 전체 숙제 목록 로드
    const homeworkSnap = await adminDb.collection("homework").get();
    
    // 3. 아이별 전역 알림 완료 설정 로드
    const settingsSnap = await adminDb.collection("notification_settings").get();
    const settingsMap: Record<string, any> = {};
    settingsSnap.forEach((doc: any) => {
      settingsMap[doc.id] = doc.data();
    });

    const activeAlarms: Array<{ kid: string; kidLabel: string; time: string; alarmLabel: string }> = [];
    const kids: Array<"soyoon" | "somin"> = ["soyoon", "somin"];

    for (const kid of kids) {
      // 오늘 해당 아이의 활성화된 숙제 리스트 조회
      const kidHomeworks: any[] = [];
      for (const doc of homeworkSnap.docs) {
        const item = doc.data();
        const itemId = doc.id;
        if (item.kid !== kid) continue;
        if (dateStr < item.date) continue;
        if (item.endDate && dateStr > item.endDate) continue;

        let isTodayActive = false;
        if (!item.isRecurring) {
          isTodayActive = (item.date === dateStr);
        } else {
          isTodayActive = item.recurringDays.includes(dayOfWeek);
        }
        if (!isTodayActive) continue;

        // 오늘 날짜 오버라이드 내역 확인 (완료 여부, 삭제 여부)
        const overrideDoc = await adminDb.collection("overrides").doc(`${dateStr}_${itemId}`).get();
        const overrideData = overrideDoc.exists ? overrideDoc.data() : null;

        // 오늘 삭제(제외)되었거나 완료되었으면 미완료 목록에서 필터링
        if (overrideData?.deleted === true) continue;
        if (overrideData?.completed === true) continue;

        kidHomeworks.push({ id: itemId, ...item });
      }

      // 오늘 해야 할 미완료 숙제가 하나라도 있다면 알림 기준 시간 매칭 검사
      if (kidHomeworks.length > 0) {
        const settings = settingsMap[kid] || { weeklyCompletionTimes: Array(7).fill("18:00") };
        const targetTimeStr = settings.weeklyCompletionTimes?.[dayOfWeek] || "18:00";

        const [schHour, schMin] = targetTimeStr.split(":").map(Number);
        const schMinutes = schHour * 60 + schMin;

        // 알림 옵션 3가지 검사 (2시간 전, 1시간 전, 정시)
        const alarmOptions = [
          { value: "2_hour", offset: 120, label: "2시간 전" },
          { value: "1_hour", offset: 60, label: "1시간 전" },
          { value: "at_time", offset: 0, label: "정시" },
        ];

        for (const opt of alarmOptions) {
          const targetAlarmMinutes = schMinutes - opt.offset;
          if (currentMinutesKST === targetAlarmMinutes) {
            activeAlarms.push({
              kid,
              kidLabel: kid === "soyoon" ? "소윤이" : "소민이",
              time: targetTimeStr,
              alarmLabel: opt.label
            });
          }
        }
      }
    }

    // 4. 발송할 알람이 있다면 각 기기의 알림 선호도(소윤이만, 소민이만, 둘 다)에 맞게 필터링하여 전송
    if (activeAlarms.length > 0) {
      const devicesSnap = await adminDb.collection("devices").get();
      
      const forwardedHost = req.headers.get("x-forwarded-host");
      const host = forwardedHost || req.headers.get("host") || "";
      let cleanHost = host;
      if (host.includes("0.0.0.0") || host === "") {
        cleanHost = "todo--sosohomwork.asia-east1.hosted.app";
      }
      const proto = req.headers.get("x-forwarded-proto") || "https";
      const origin = `${proto}://${cleanHost}`;

      let sentCount = 0;

      // 알람 대상별로 푸시 전송
      for (const alarm of activeAlarms) {
        const alarmTokens: string[] = [];
        devicesSnap.forEach((d: any) => {
          const deviceData = d.data();
          const token = deviceData.token;
          const pref = deviceData.alarmPreference || "both"; // 기본은 둘 다 받기
          if (token && (pref === "both" || pref === alarm.kid)) {
            alarmTokens.push(token);
          }
        });

        if (alarmTokens.length === 0) {
          console.log(`[send-alarms] [${alarm.kidLabel}]의 숙제 알림을 전송할 대상 기기가 없습니다.`);
          continue;
        }

        const message = {
          notification: {
            title: `⏰ 숙제 완료 알림 [${alarm.kidLabel}]`,
            body: alarm.alarmLabel === "정시"
              ? `${alarm.kidLabel}의 오늘의 숙제 완료 정시입니다! 지금 숙제를 마칠 시간입니다! 💪`
              : `${alarm.kidLabel}의 오늘의 숙제 완료 ${alarm.alarmLabel}입니다! 얼른 완료하고 신나게 놀아볼까요? 💪`
          },
          data: {
            link: `${origin}/`
          },
          webpush: {
            notification: {
              icon: "/favicon.ico",
              badge: "/favicon.ico"
            },
            fcmOptions: {
              link: `${origin}/`
            }
          },
          tokens: alarmTokens
        };

        const response = await adminMessaging.sendEachForMulticast(message);
        console.log(`[send-alarms] [${alarm.kidLabel}] 푸시 발송 결과 성공수: ${response.successCount}, 실패수: ${response.failureCount}`);
        sentCount++;
      }

      return NextResponse.json({
        success: true,
        message: `성공적으로 ${sentCount}개의 알람에 대해 푸시를 전송했습니다.`,
        alarmsSent: activeAlarms
      });
    }

    return NextResponse.json({
      success: true,
      message: "체크 완료. 이번 분에는 발송할 알람 대상이 없습니다."
    });
  } catch (err: any) {
    console.error("[send-alarms] API 작업 에러:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
