"use client";

import React, { useState, useEffect } from "react";
import { KidNotificationSettings } from "../utils/types";

interface CompletionTimeModalProps {
  isOpen: boolean;
  onClose: () => void;
  kid: "soyoon" | "somin";
  initialSettings: KidNotificationSettings | null;
  onSave: (settings: KidNotificationSettings) => Promise<void>;
}

export function CompletionTimeModal({
  isOpen,
  onClose,
  kid,
  initialSettings,
  onSave,
}: CompletionTimeModalProps) {
  // 월~일 완료 시간 상태 (기본값 "18:00")
  const [times, setTimes] = useState<string[]>(Array(7).fill("18:00"));
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (isOpen && initialSettings) {
      setTimes(initialSettings.weeklyCompletionTimes);
    } else {
      setTimes(Array(7).fill("18:00"));
    }
  }, [isOpen, initialSettings]);

  if (!isOpen) return null;

  const kidLabel = kid === "soyoon" ? "소윤이" : "소민이";
  const themeClass = kid === "soyoon" ? "theme-soyoon" : "theme-somin";

  const weekDayNames = [
    "일요일",
    "월요일",
    "화요일",
    "수요일",
    "목요일",
    "금요일",
    "토요일",
  ];

  const handleTimeChange = (index: number, val: string) => {
    const nextTimes = [...times];
    nextTimes[index] = val;
    setTimes(nextTimes);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      await onSave({
        kid,
        weeklyCompletionTimes: times,
      });
      onClose();
    } catch (err: any) {
      console.error(err);
      alert(`시간 설정 서버 동기화에 실패했습니다. 다른 기기로 동기화되지 않을 수 있습니다.\n원인: ${err?.message || err}`);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className={`modal-content ${themeClass}`}
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: "420px" }}
      >
        <div className="modal-header">
          <h3 className="modal-title">⏰ {kidLabel}의 완료 시간 설정</h3>
          <button className="close-btn" onClick={onClose}>
            ✖
          </button>
        </div>

        <p style={{ fontSize: "0.85rem", color: "#868e96", marginBottom: "16px", lineHeight: "1.4" }}>
          * 지정된 요일에 숙제가 있는 날, 완료 시간의 2시간 전, 1시간 전, 정시에 자동으로 스마트폰/브라우저 알림이 발송됩니다.
        </p>

        <form onSubmit={handleSubmit}>
          <div style={{ display: "flex", flexDirection: "column", gap: "10px", maxHeight: "350px", overflowY: "auto", paddingRight: "4px" }}>
            {weekDayNames.map((dayName, idx) => {
              const isWeekend = idx === 0 || idx === 6;
              return (
                <div
                  key={idx}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "8px 12px",
                    background: "#faf8f5",
                    borderRadius: "12px",
                    border: "1px solid #f0e6df",
                  }}
                >
                  <span
                    style={{
                      fontFamily: "'Jua', sans-serif",
                      fontSize: "0.95rem",
                      color: idx === 0 ? "#fa5252" : idx === 6 ? "#228be6" : "#4a3b32",
                    }}
                  >
                    {dayName}
                  </span>
                  <input
                    type="time"
                    className="form-input"
                    style={{
                      width: "120px",
                      padding: "4px 8px",
                      fontSize: "0.95rem",
                      borderRadius: "8px",
                      border: "2px solid #e2e8f0",
                    }}
                    value={times[idx]}
                    onChange={(e) => handleTimeChange(idx, e.target.value)}
                    required
                  />
                </div>
              );
            })}
          </div>

          <div className="modal-actions">
            <button
              type="button"
              className="cute-btn"
              onClick={onClose}
              style={{ background: "#e2e8f0", borderBottomColor: "#cbd5e1" }}
              disabled={isSaving}
            >
              취소
            </button>
            <button
              type="submit"
              className={`cute-btn ${kid === "soyoon" ? "primary-soyoon" : "primary-somin"}`}
              disabled={isSaving}
            >
              {isSaving ? "저장 중..." : "저장 완료 🎉"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
