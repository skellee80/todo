"use client";

import React, { useState, useEffect, useRef } from "react";
import { HomeworkItem, HomeworkInstanceOverride, isHomeworkActiveOnDate, KidNotificationSettings } from "../utils/types";
import { subscribeKidNotificationSettings } from "../utils/firebaseService";

interface AlarmMonitorProps {
  homeworkItems: HomeworkItem[];
  overrides: Record<string, Record<string, HomeworkInstanceOverride>>;
}

interface ActiveAlarm {
  id: string;
  kid: "soyoon" | "somin";
  time: string;
  alarmLabel: string;
}

export function AlarmMonitor({ homeworkItems, overrides }: AlarmMonitorProps) {
  const [activeAlarm, setActiveAlarm] = useState<ActiveAlarm | null>(null);
  const [soyoonSettings, setSoyoonSettings] = useState<KidNotificationSettings | null>(null);
  const [sominSettings, setSominSettings] = useState<KidNotificationSettings | null>(null);
  
  // 오늘 이미 울린 알람 기록 (새로고침 시 방지하기 위해 로컬스토리지 연동)
  // 키 형식: kid_YYYY-MM-DD_option
  const triggeredAlarmsRef = useRef<Record<string, boolean>>({});

  // 로컬 시간 구하는 포맷터 (YYYY-MM-DD)
  const getTodayDateString = () => {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const r = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${r}`;
  };

  // Web Audio API로 귀여운 차임벨 사운드 합성 재생
  const playChime = () => {
    try {
      const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContext) return;
      const ctx = new AudioContext();
      
      // 첫 번째 도(C5) 음
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = "sine";
      osc1.frequency.setValueAtTime(523.25, ctx.currentTime); // C5
      gain1.gain.setValueAtTime(0.08, ctx.currentTime);
      gain1.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.start();
      osc1.stop(ctx.currentTime + 0.4);
      
      // 두 번째 미(E5) 음 (0.15초 뒤 재생)
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = "sine";
      osc2.frequency.setValueAtTime(659.25, ctx.currentTime + 0.15); // E5
      gain2.gain.setValueAtTime(0.08, ctx.currentTime + 0.15);
      gain2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.55);
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.start(ctx.currentTime + 0.15);
      osc2.stop(ctx.currentTime + 0.55);
    } catch (e) {
      console.log("효과음 재생 차단됨 (사용자 상호작용 필요):", e);
    }
  };

  const prevSoyoonTimesRef = useRef<string[] | null>(null);
  const prevSominTimesRef = useRef<string[] | null>(null);

  // 1. 아이별 전역 알림 설정 구독 및 완료 시간 변경 시 오늘 울린 알람 캐시 리셋
  useEffect(() => {
    const unsubSoyoon = subscribeKidNotificationSettings("soyoon", (s) => {
      setSoyoonSettings(s);
      if (s?.weeklyCompletionTimes) {
        const todayStr = getTodayDateString();
        if (prevSoyoonTimesRef.current && 
            JSON.stringify(prevSoyoonTimesRef.current) !== JSON.stringify(s.weeklyCompletionTimes)) {
          console.log("소윤이 완료 시간 변경 감지: 오늘 울린 알람 캐시 리셋");
          const nextAlarms = { ...triggeredAlarmsRef.current };
          delete nextAlarms[`soyoon_${todayStr}_2_hour`];
          delete nextAlarms[`soyoon_${todayStr}_1_hour`];
          delete nextAlarms[`soyoon_${todayStr}_at_time`];
          triggeredAlarmsRef.current = nextAlarms;
          try {
            localStorage.setItem(`triggered_alarms_${todayStr}`, JSON.stringify(nextAlarms));
          } catch (e) {}
        }
        prevSoyoonTimesRef.current = s.weeklyCompletionTimes;
      }
    });

    const unsubSomin = subscribeKidNotificationSettings("somin", (s) => {
      setSominSettings(s);
      if (s?.weeklyCompletionTimes) {
        const todayStr = getTodayDateString();
        if (prevSominTimesRef.current && 
            JSON.stringify(prevSominTimesRef.current) !== JSON.stringify(s.weeklyCompletionTimes)) {
          console.log("소민이 완료 시간 변경 감지: 오늘 울린 알람 캐시 리셋");
          const nextAlarms = { ...triggeredAlarmsRef.current };
          delete nextAlarms[`somin_${todayStr}_2_hour`];
          delete nextAlarms[`somin_${todayStr}_1_hour`];
          delete nextAlarms[`somin_${todayStr}_at_time`];
          triggeredAlarmsRef.current = nextAlarms;
          try {
            localStorage.setItem(`triggered_alarms_${todayStr}`, JSON.stringify(nextAlarms));
          } catch (e) {}
        }
        prevSominTimesRef.current = s.weeklyCompletionTimes;
      }
    });

    return () => {
      unsubSoyoon();
      unsubSomin();
    };
  }, []);

  // 2. 타이머로 알람 감지 (10초 주기)
  useEffect(() => {
    const todayStr = getTodayDateString();
    try {
      const stored = localStorage.getItem(`triggered_alarms_${todayStr}`);
      if (stored) {
        triggeredAlarmsRef.current = JSON.parse(stored);
      }
    } catch (e) {
      console.error(e);
    }

    const interval = setInterval(() => {
      const todayStr = getTodayDateString();
      const now = new Date();
      
      // 오늘 몇 분이 지났는지 계산
      const nowMinutes = now.getHours() * 60 + now.getMinutes();
      const dayOfWeek = now.getDay(); // 0(일)~6(토)

      // 현재 브라우저의 알림 선호도 확인 (localStorage)
      let pref: "soyoon" | "somin" | "both" = "both";
      try {
        const storedPref = localStorage.getItem("alarm_preference");
        if (storedPref === "soyoon" || storedPref === "somin" || storedPref === "both") {
          pref = storedPref;
        }
      } catch (e) {}

      // 아이별 순차 검사
      const kids: Array<"soyoon" | "somin"> = ["soyoon", "somin"];

      for (const kid of kids) {
        // 알림 수신 선호 필터링
        if (pref !== "both" && pref !== kid) continue;

        // 오늘 해당 아이의 활성화된 숙제 리스트 조회
        const activeHomeworks = homeworkItems.filter((item) => {
          if (item.kid !== kid) return false;
          if (!isHomeworkActiveOnDate(item, todayStr)) return false;
          const dayOverride = overrides[todayStr]?.[item.id];
          if (dayOverride && dayOverride.deleted) return false;
          return true;
        });

        if (activeHomeworks.length === 0) continue;

        // 하나라도 미완료 숙제가 있는지 검증
        const hasPendingHomework = activeHomeworks.some((item) => {
          const dayOverride = overrides[todayStr]?.[item.id];
          return dayOverride ? !dayOverride.completed : true; // 기본값 false(=미완료)
        });

        if (!hasPendingHomework) continue;

        // 아이의 오늘 완료 예정 시간 로드
        const settings = kid === "soyoon" ? soyoonSettings : sominSettings;
        if (!settings || !settings.weeklyCompletionTimes) continue;

        const targetTimeStr = settings.weeklyCompletionTimes[dayOfWeek] || "18:00";
        const [schHour, schMin] = targetTimeStr.split(":").map(Number);
        const schMinutes = schHour * 60 + schMin;

        // 알림 오프셋 옵션 (2시간 전, 1시간 전, 정시)
        const alarmOptions = [
          { value: "2_hour", offset: 120, label: "완료 2시간 전" },
          { value: "1_hour", offset: 60, label: "완료 1시간 전" },
          { value: "at_time", offset: 0, label: "완료 정시" },
        ];

        let triggeredAnAlarm = false;

        for (const opt of alarmOptions) {
          const targetAlarmMinutes = schMinutes - opt.offset;
          
          // 고유 알람 트리거 키: kid_todayStr_option
          const triggerKey = `${kid}_${todayStr}_${opt.value}`;
          if (triggeredAlarmsRef.current[triggerKey]) continue;

          // 현재 시각 분이 알람 타겟 분의 5분 이내 범위에 들어오는 경우 작동 (백그라운드 지연 구동 보완)
          if (nowMinutes >= targetAlarmMinutes && nowMinutes < targetAlarmMinutes + 5) {
            triggeredAlarmsRef.current[triggerKey] = true;

            try {
              localStorage.setItem(
                `triggered_alarms_${todayStr}`,
                JSON.stringify(triggeredAlarmsRef.current)
              );
            } catch (e) {
              console.error(e);
            }

            playChime();
            setActiveAlarm({
              id: triggerKey,
              kid,
              time: targetTimeStr,
              alarmLabel: opt.label,
            });

            // 브라우저 네이티브 시스템 알림(노티바) 팝업 발송
            if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted") {
              const kidName = kid === "soyoon" ? "소윤이" : "소민이";
              const notificationTitle = `⏰ 숙제 완료 알림 [${kidName}]`;
              const notificationBody = opt.label === "완료 정시"
                ? `${kidName}의 오늘의 숙제 완료 정시입니다! 지금 숙제를 마칠 시간입니다! 💪`
                : `${kidName}의 오늘의 숙제 완료 ${opt.label}입니다! 얼른 완료하고 신나게 놀아볼까요? 💪`;
              
              const notificationOptions = {
                body: notificationBody,
                icon: window.location.origin + "/favicon.ico",
                badge: window.location.origin + "/favicon.ico",
                tag: triggerKey,
                requireInteraction: true
              };

              if ("serviceWorker" in navigator) {
                navigator.serviceWorker.ready.then((registration) => {
                  registration.showNotification(notificationTitle, notificationOptions);
                }).catch(() => {
                  new Notification(notificationTitle, notificationOptions);
                });
              } else {
                new Notification(notificationTitle, notificationOptions);
              }
            }

            triggeredAnAlarm = true;
            break;
          }
        }

        if (triggeredAnAlarm) {
          break; // 여러 알람이 동시 울리거나 두 아이가 동시 울리더라도 하나씩 처리
        }
      }
    }, 10000);

    return () => clearInterval(interval);
  }, [homeworkItems, overrides, soyoonSettings, sominSettings]);

  if (!activeAlarm) return null;

  const kidName = activeAlarm.kid === "soyoon" ? "소윤이" : "소민이";
  const themeClass = activeAlarm.kid === "soyoon" ? "theme-soyoon" : "theme-somin";

  return (
    <div className={`modal-overlay ${themeClass}`}>
      <div className="modal-content alarm-modal-content">
        <span className="alarm-icon">🔔</span>
        <h3 className="alarm-title">숙제 완료 알림!</h3>
        <p className="alarm-message" style={{ fontSize: "1.1rem", lineHeight: "1.5" }}>
          <strong>{kidName}</strong>의 오늘의 숙제 <strong>{activeAlarm.alarmLabel}</strong>입니다! 💪<br />
          {activeAlarm.alarmLabel === "완료 정시" ? (
            <>지금 숙제를 마칠 시간입니다!</>
          ) : (
            <>얼른 완료하고 신나게 놀아볼까요?</>
          )}<br />
          <span style={{ fontSize: "0.9rem", color: "#868e96" }}>({kidName} 완료 기준시간: {activeAlarm.time})</span>
        </p>
        <button
          className={`cute-btn ${activeAlarm.kid === "soyoon" ? "primary-soyoon" : "primary-somin"}`}
          onClick={() => setActiveAlarm(null)}
          style={{ width: "120px", marginTop: "10px" }}
        >
          확인했어요! 👍
        </button>
      </div>
    </div>
  );
}
