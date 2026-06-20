"use client";

import React, { useState } from "react";
import { HomeworkItem, HomeworkInstanceOverride, isHomeworkActiveOnDate } from "../utils/types";

interface CalendarViewProps {
  currentKid: 'soyoon' | 'somin';
  selectedDate: Date;
  setSelectedDate: (date: Date) => void;
  homeworkItems: HomeworkItem[];
  overrides: Record<string, Record<string, HomeworkInstanceOverride>>;
}

export function CalendarView({
  currentKid,
  selectedDate,
  setSelectedDate,
  homeworkItems,
  overrides,
}: CalendarViewProps) {
  // 달력에서 현재 조회 중인 연도와 월 (로컬 기준)
  const today = new Date();
  const [viewDate, setViewDate] = useState<Date>(new Date(today.getFullYear(), today.getMonth(), 1));

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth(); // 0-11

  // 날짜 문자열 변환 유틸리티 (로컬 기준 YYYY-MM-DD)
  const toDateString = (y: number, m: number, d: number) => {
    const mm = String(m + 1).padStart(2, "0");
    const dd = String(d).padStart(2, "0");
    return `${y}-${mm}-${dd}`;
  };

  const toDateStringObj = (d: Date) => {
    return toDateString(d.getFullYear(), d.getMonth(), d.getDate());
  };

  // 이전 달로 이동
  const handlePrevMonth = () => {
    setViewDate(new Date(year, month - 1, 1));
  };

  // 다음 달로 이동
  const handleNextMonth = () => {
    setViewDate(new Date(year, month + 1, 1));
  };

  // 오늘이 속한 달로 이동하고 오늘 날짜 선택
  const handleGoToday = () => {
    const newToday = new Date();
    setViewDate(new Date(newToday.getFullYear(), newToday.getMonth(), 1));
    setSelectedDate(newToday);
  };

  // 요일 헤더
  const weekDays = ["일", "월", "화", "수", "목", "금", "토"];

  // 달력 격자에 들어갈 날짜 목록 생성 (6주 = 42개 고정 셀)
  const getCalendarDays = () => {
    const days = [];
    
    // 이번 달 1일의 요일 (0: 일요일, 6: 토요일)
    const firstDayIndex = new Date(year, month, 1).getDay();
    
    // 이번 달의 총 일수
    const totalDaysInMonth = new Date(year, month + 1, 0).getDate();
    
    // 이전 달의 총 일수
    const totalDaysInPrevMonth = new Date(year, month, 0).getDate();

    // 1. 이전 달 날짜 채우기
    for (let i = firstDayIndex - 1; i >= 0; i--) {
      const prevDate = new Date(year, month - 1, totalDaysInPrevMonth - i);
      days.push({
        date: prevDate,
        isCurrentMonth: false,
        key: toDateStringObj(prevDate),
      });
    }

    // 2. 이번 달 날짜 채우기
    for (let i = 1; i <= totalDaysInMonth; i++) {
      const currDate = new Date(year, month, i);
      days.push({
        date: currDate,
        isCurrentMonth: true,
        key: toDateStringObj(currDate),
      });
    }

    // 3. 다음 달 날짜 채우기 (42칸이 채워질 때까지)
    let nextMonthDay = 1;
    while (days.length < 42) {
      const nextDate = new Date(year, month + 1, nextMonthDay);
      days.push({
        date: nextDate,
        isCurrentMonth: false,
        key: toDateStringObj(nextDate),
      });
      nextMonthDay++;
    }

    return days;
  };

  const calendarDays = getCalendarDays();
  const todayStr = toDateStringObj(today);
  const selectedStr = toDateStringObj(selectedDate);

  return (
    <div className="cute-card">
      {/* 달력 네비게이션 헤더 */}
      <div className="calendar-nav">
        <h2 className="nav-title">
          🗓️ {year}년 {month + 1}월
        </h2>
        <div className="nav-buttons">
          <button className="cute-btn" onClick={handlePrevMonth}>
            ◀ 이전 달
          </button>
          <button 
            className={`cute-btn ${currentKid === 'soyoon' ? 'primary-soyoon' : 'primary-somin'}`} 
            onClick={handleGoToday}
          >
            오늘
          </button>
          <button className="cute-btn" onClick={handleNextMonth}>
            다음 달 ▶
          </button>
        </div>
      </div>

      {/* 요일 헤더 */}
      <div className="calendar-grid" style={{ marginBottom: "8px" }}>
        {weekDays.map((day, idx) => (
          <div key={idx} className="calendar-header-cell">
            {day}
          </div>
        ))}
      </div>

      {/* 날짜 그리드 */}
      <div className="calendar-grid">
        {calendarDays.map(({ date, isCurrentMonth, key }) => {
          const isToday = key === todayStr;
          const isSelected = key === selectedStr;
          
          // 해당 날짜에 활성화된 숙제 리스트 필터링 (현재 활성화된 아이 기준)
          const activeHomework = homeworkItems.filter((item) => {
            if (item.kid !== currentKid) return false;
            return isHomeworkActiveOnDate(item, key);
          });

          return (
            <div
              key={key}
              className={`calendar-day-cell ${!isCurrentMonth ? "other-month" : ""} ${
                isToday ? "today" : ""
              } ${isSelected ? "selected" : ""}`}
              onClick={() => setSelectedDate(date)}
            >
              <div className="day-number">{date.getDate()}</div>
              
              {/* 숙제 미니 프리뷰 */}
              <div className="day-preview-list">
                {activeHomework.slice(0, 2).map((item) => {
                  const dayOverride = overrides[key]?.[item.id];
                  const isCompleted = dayOverride ? dayOverride.completed : false;
                  
                  // 이모지 및 체크 표시 접두사 제거
                  const cleanTitle = item.title.replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu, "").trim();
                  return (
                    <div
                      key={item.id}
                      className={`day-preview-item ${isCompleted ? "completed" : "pending"}`}
                    >
                      {cleanTitle}
                    </div>
                  );
                })}
                {activeHomework.length > 2 && (
                  <div className="day-preview-item" style={{ background: "#e2e8f0", color: "#475569" }}>
                    + {activeHomework.length - 2}개 더
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
