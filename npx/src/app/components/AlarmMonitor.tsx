"use client";

import React, { useState, useEffect, useRef } from "react";
import { HomeworkItem, HomeworkInstanceOverride, isHomeworkActiveOnDate } from "../utils/types";

interface AlarmMonitorProps {
  homeworkItems: HomeworkItem[];
  overrides: Record<string, Record<string, HomeworkInstanceOverride>>;
}

interface ActiveAlarm {
  homeworkId: string;
  title: string;
  kid: "soyoon" | "somin";
  time: string;
  alarmLabel: string;
}

export function AlarmMonitor({ homeworkItems, overrides }: AlarmMonitorProps) {
  const [activeAlarm, setActiveAlarm] = useState<ActiveAlarm | null>(null);
  
  // 오늘 이미 울린 알람 기록 (새로고침 시 방지하기 위해 로컬스토리지 연동)
  // 키 형식: homeworkId_YYYY-MM-DD
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

  useEffect(() => {
    // 마운트 시 로컬스토리지에서 오늘 울린 알람 읽어오기
    const todayStr = getTodayDateString();
    try {
      const stored = localStorage.getItem(`triggered_alarms_${todayStr}`);
      if (stored) {
        triggeredAlarmsRef.current = JSON.parse(stored);
      }
    } catch (e) {
      console.error(e);
    }

    // 10초마다 알람 감지 타이머 작동
    const interval = setInterval(() => {
      const todayStr = getTodayDateString();
      const now = new Date();
      
      // 오늘 몇 분이 지났는지 계산
      const nowMinutes = now.getHours() * 60 + now.getMinutes();

      // 현재 브라우저의 알림 선호도 확인 (localStorage)
      let pref: "soyoon" | "somin" | "both" = "both";
      try {
        const storedPref = localStorage.getItem("alarm_preference");
        if (storedPref === "soyoon" || storedPref === "somin" || storedPref === "both") {
          pref = storedPref;
        }
      } catch (e) {}

      // 오늘 활성화된 숙제 리스트 조회
      const todaysHomeworks = homeworkItems.filter((item) =>
        isHomeworkActiveOnDate(item, todayStr)
      );

      for (const item of todaysHomeworks) {
        // 알림 수신 설정에 맞지 않는 아이의 숙제 알람은 스킵 (노티바 차단과 일치하도록 처리)
        if (pref !== "both" && pref !== item.kid) continue;

        // 이미 완료된 숙제는 알람 패스
        const dayOverride = overrides[todayStr]?.[item.id];
        const isCompleted = dayOverride ? dayOverride.completed : false;
        if (isCompleted) continue;

        // 알람 설정 확인
        // 만약 개별 알람 오버라이드가 있으면 적용, 없으면 기본 알람 적용
        const activeAlarmOption = dayOverride?.alarmOverride !== undefined 
          ? dayOverride.alarmOverride 
          : item.alarmOption;

        if (activeAlarmOption === "none") continue;

        // 숙제 시작 시분 파싱
        const [schHour, schMin] = item.time.split(":").map(Number);
        const schMinutes = schHour * 60 + schMin;

        // 알람 옵션에 따른 분 오프셋 계산
        let offset = 0;
        let alarmLabel = "정시";
        if (activeAlarmOption === "10_min") {
          offset = 10;
          alarmLabel = "10분 전";
        } else if (activeAlarmOption === "30_min") {
          offset = 30;
          alarmLabel = "30분 전";
        } else if (activeAlarmOption === "1_hour") {
          offset = 60;
          alarmLabel = "1시간 전";
        }

        const targetAlarmMinutes = schMinutes - offset;

        // 오늘 이미 울렸는지 체크
        const triggerKey = `${item.id}_${todayStr}`;
        if (triggeredAlarmsRef.current[triggerKey]) continue;

        // 현재 시간이 알람 시간 이상이고, 숙제 시작 시간 이후 30분 이내인 경우 작동
        // (지나치게 과거의 알람이 페이지 열자마자 울리는 것 방지)
        if (nowMinutes >= targetAlarmMinutes && nowMinutes <= schMinutes + 30) {
          // 알람 트리거!
          triggeredAlarmsRef.current[triggerKey] = true;
          
          // 로컬스토리지에 저장
          try {
            localStorage.setItem(
              `triggered_alarms_${todayStr}`,
              JSON.stringify(triggeredAlarmsRef.current)
            );
          } catch (e) {
            console.error(e);
          }

          // 소리 재생 및 상태 설정
          playChime();
          setActiveAlarm({
            homeworkId: item.id,
            title: item.title,
            kid: item.kid,
            time: item.time,
            alarmLabel,
          });
          break; // 여러 개가 동시 작동하더라도 하나씩 처리하도록 브레이크
        }
      }
    }, 10000);

    return () => clearInterval(interval);
  }, [homeworkItems, overrides]);

  if (!activeAlarm) return null;

  const kidName = activeAlarm.kid === "soyoon" ? "소윤이" : "소민이";
  const themeClass = activeAlarm.kid === "soyoon" ? "theme-soyoon" : "theme-somin";

  return (
    <div className={`modal-overlay ${themeClass}`}>
      <div className="modal-content alarm-modal-content">
        <span className="alarm-icon">🔔</span>
        <h3 className="alarm-title">숙제 알림!</h3>
        <p className="alarm-message">
          <strong>{kidName}</strong>의 <strong>[{activeAlarm.title}]</strong> 숙제<br />
          {activeAlarm.alarmLabel === "정시" ? (
            <>지금 <strong>시작할 시간(정시)</strong>입니다!</>
          ) : (
            <>시작 <strong>{activeAlarm.alarmLabel}</strong>입니다!</>
          )} ({activeAlarm.time} 예정)
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
