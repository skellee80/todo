"use client";

import React, { useState, useEffect } from "react";
import { HomeworkItem } from "../utils/types";

interface HomeworkModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (item: Omit<HomeworkItem, "id">) => void;
  defaultKid: "soyoon" | "somin";
  defaultDate: Date;
}

export function HomeworkModal({
  isOpen,
  onClose,
  onSave,
  defaultKid,
  defaultDate,
}: HomeworkModalProps) {
  const [title, setTitle] = useState("");
  const [kid, setKid] = useState<"soyoon" | "somin">(defaultKid);
  const [dateStr, setDateStr] = useState("");
  const [timeStr, setTimeStr] = useState("14:00");
  
  // 반복 설정 상태
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurringDays, setRecurringDays] = useState<number[]>([]);

  // 알람 설정 상태
  const [alarmOption, setAlarmOption] = useState<
    "none" | "at_time" | "10_min" | "30_min" | "1_hour"
  >("none");

  // 모달이 열릴 때마다 필드 초기화
  useEffect(() => {
    if (isOpen) {
      setTitle("");
      setKid(defaultKid);
      
      // 날짜 세팅
      const y = defaultDate.getFullYear();
      const m = String(defaultDate.getMonth() + 1).padStart(2, "0");
      const d = String(defaultDate.getDate()).padStart(2, "0");
      setDateStr(`${y}-${m}-${d}`);
      
      setTimeStr("14:00");
      setIsRecurring(false);
      
      // 클릭한 날짜의 요일을 기본 반복 요일로 제안하기 위해 계산
      const currentDayOfWeek = defaultDate.getDay();
      setRecurringDays([currentDayOfWeek]);
      
      setAlarmOption("none");
    }
  }, [isOpen, defaultKid, defaultDate]);

  if (!isOpen) return null;

  const weekDays = [
    { label: "일", value: 0 },
    { label: "월", value: 1 },
    { label: "화", value: 2 },
    { label: "수", value: 3 },
    { label: "목", value: 4 },
    { label: "금", value: 5 },
    { label: "토", value: 6 },
  ];

  // 요일 토글 핸들러
  const handleDayToggle = (dayValue: number) => {
    if (recurringDays.includes(dayValue)) {
      setRecurringDays(recurringDays.filter((d) => d !== dayValue));
    } else {
      setRecurringDays([...recurringDays, dayValue]);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      alert("숙제 이름을 입력해 주세요! 📝");
      return;
    }
    if (isRecurring && recurringDays.length === 0) {
      alert("반복할 요일을 하나 이상 선택해 주세요! 🗓️");
      return;
    }

    onSave({
      title: title.trim(),
      kid,
      date: dateStr,
      time: timeStr,
      isRecurring,
      recurringDays: isRecurring ? recurringDays : [],
      alarmOption,
    });
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div 
        className={`modal-content ${kid === 'soyoon' ? 'theme-soyoon' : 'theme-somin'}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h3 className="modal-title">📝 새로운 숙제 등록</h3>
          <button className="close-btn" onClick={onClose}>
            ✖
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          {/* 숙제 이름 */}
          <div className="form-group">
            <label className="form-label">✍ 숙제 이름</label>
            <input
              type="text"
              className="form-input"
              placeholder="예: 영어 단어장 5장, 수학 연산학습지"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              autoFocus
            />
          </div>

          {/* 대상 (소윤/소민) */}
          <div className="form-group">
            <label className="form-label">👧👦 누구의 숙제인가요?</label>
            <div style={{ display: "flex", gap: "10px", marginTop: "4px" }}>
              <button
                type="button"
                className={`cute-btn ${kid === "soyoon" ? "primary-soyoon" : ""}`}
                style={{ flex: 1, border: "2px solid #ff8787" }}
                onClick={() => setKid("soyoon")}
              >
                🌸 소윤이
              </button>
              <button
                type="button"
                className={`cute-btn ${kid === "somin" ? "primary-somin" : ""}`}
                style={{ flex: 1, border: "2px solid #4dadf7" }}
                onClick={() => setKid("somin")}
              >
                💧 소민이
              </button>
            </div>
          </div>

          {/* 시작 날짜 */}
          <div className="form-group">
            <label className="form-label">📅 날짜</label>
            <input
              type="date"
              className="form-input"
              value={dateStr}
              onChange={(e) => setDateStr(e.target.value)}
              required
            />
          </div>

          {/* 숙제 시간 (시/분) */}
          <div className="form-group">
            <label className="form-label">⏰ 숙제 시작 시간</label>
            <input
              type="time"
              className="form-input"
              value={timeStr}
              onChange={(e) => setTimeStr(e.target.value)}
              required
            />
          </div>

          {/* 반복 설정 */}
          <div className="form-group" style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <label className="form-label" style={{ cursor: "pointer" }}>
              <input
                type="checkbox"
                style={{ marginRight: "8px", width: "18px", height: "18px", cursor: "pointer" }}
                checked={isRecurring}
                onChange={(e) => setIsRecurring(e.target.checked)}
              />
              매주 반복할까요?
            </label>
          </div>

          {isRecurring && (
            <div className="form-group">
              <label className="form-label">🗓️ 어떤 요일에 반복할까요?</label>
              <div className="days-select-grid">
                {weekDays.map((day) => {
                  const isChecked = recurringDays.includes(day.value);
                  return (
                    <label
                      key={day.value}
                      className={`day-checkbox-label ${isChecked ? "checked" : ""}`}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => handleDayToggle(day.value)}
                      />
                      {day.label}
                    </label>
                  );
                })}
              </div>
            </div>
          )}

          {/* 알람 설정 */}
          <div className="form-group">
            <label className="form-label">🔔 미리 알림 설정</label>
            <select
              className="form-input"
              value={alarmOption}
              onChange={(e) => setAlarmOption(e.target.value as any)}
              style={{ background: "#ffffff", appearance: "auto" }}
            >
              <option value="none">알림 없음</option>
              <option value="at_time">정시에 알려주기</option>
              <option value="10_min">10분 전에 알려주기</option>
              <option value="30_min">30분 전에 알려주기</option>
              <option value="1_hour">1시간 전에 알려주기</option>
            </select>
          </div>

          {/* 저장 및 취소 */}
          <div className="modal-actions">
            <button
              type="button"
              className="cute-btn"
              onClick={onClose}
              style={{ background: "#e2e8f0", borderBottomColor: "#cbd5e1" }}
            >
              취소
            </button>
            <button
              type="submit"
              className={`cute-btn ${kid === "soyoon" ? "primary-soyoon" : "primary-somin"}`}
            >
              등록하기 🎉
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
