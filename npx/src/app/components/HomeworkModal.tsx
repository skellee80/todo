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
  
  // 반복 설정 상태
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurringDays, setRecurringDays] = useState<number[]>([]);

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
      
      setIsRecurring(false);
      
      // 클릭한 날짜의 요일을 기본 반복 요일로 제안하기 위해 계산
      const currentDayOfWeek = defaultDate.getDay();
      setRecurringDays([currentDayOfWeek]);
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
      time: "18:00",
      isRecurring,
      recurringDays: isRecurring ? recurringDays : [],
      alarmOption: "none",
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
