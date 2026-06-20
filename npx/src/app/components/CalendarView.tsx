"use client";

import React, { useState } from "react";
import { HomeworkItem, HomeworkInstanceOverride, isHomeworkActiveOnDate } from "../utils/types";

// 한국 공휴일 정보 (양력 고정 공휴일)
const SOLAR_HOLIDAYS = [
  "01-01", // 신정
  "03-01", // 삼일절
  "05-05", // 어린이날
  "06-06", // 현충일
  "07-17", // 제헌절
  "08-15", // 광복절
  "10-03", // 개천절
  "10-09", // 한글날
  "12-25", // 크리스마스
];

// 연도별 음력 및 대체 공휴일 목록 (2024~2030)
const VARIABLE_HOLIDAYS: Record<string, string[]> = {
  "2024": [
    "02-09", "02-10", "02-11", "02-12", // 설날 및 대체공휴일
    "05-15", // 부처님오신날
    "09-16", "09-17", "09-18", // 추석
  ],
  "2025": [
    "01-28", "01-29", "01-30", // 설날
    "05-06", // 부처님오신날 대체공휴일
    "10-05", "10-06", "10-07", "10-08", // 추석 및 대체공휴일
  ],
  "2026": [
    "02-16", "02-17", "02-18", // 설날
    "03-02", // 삼일절 대체공휴일
    "05-25", // 부처님오신날 대체공휴일 (부처님오신날 5/24)
    "06-03", // 지방선거일
    "08-17", // 광복절 대체공휴일
    "09-24", "09-25", "09-26", // 추석
    "10-05", // 개천절 대체공휴일
  ],
  "2027": [
    "02-06", "02-07", "02-08", "02-09", // 설날 및 대체공휴일
    "05-13", // 부처님오신날
    "08-16", // 광복절 대체공휴일
    "09-14", "09-15", "09-16", // 추석
    "10-04", // 개천절 대체공휴일
    "10-11", // 한글날 대체공휴일
    "12-27", // 성탄절 대체공휴일
  ],
  "2028": [
    "01-25", "01-26", "01-27", // 설날
    "05-02", // 부처님오신날
    "10-01", "10-02", "10-03", "10-04", // 추석 연휴 및 대체공휴일
  ],
  "2029": [
    "02-12", "02-13", "02-14", // 설날
    "05-20", "05-21", // 부처님오신날 및 대체공휴일
    "09-21", "09-22", "09-23", "09-24", // 추석 및 대체공휴일
  ],
  "2030": [
    "02-02", "02-03", "02-04", "02-05", // 설날 및 대체공휴일
    "05-06", // 어린이날 대체공휴일
    "05-10", // 부처님오신날
    "09-11", "09-12", "09-13", // 추석
    "10-14", // 한글날 대체공휴일
  ]
};

function isKoreanHoliday(date: Date): boolean {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  const md = `${m}-${d}`;

  if (SOLAR_HOLIDAYS.includes(md)) return true;
  const yearHolidays = VARIABLE_HOLIDAYS[String(y)];
  if (yearHolidays && yearHolidays.includes(md)) return true;
  return false;
}

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

    // 3. 다음 달 날짜 채우기 (5주=35칸 또는 6주=42칸이 채워질 때까지)
    // 1일의 요일 인덱스와 이번 달 총 일수를 합산하여 35일 이하로 정리가 되면 5주만 채웁니다.
    const totalCellsNeeded = (firstDayIndex + totalDaysInMonth <= 35) ? 35 : 42;
    let nextMonthDay = 1;
    while (days.length < totalCellsNeeded) {
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

          const dayOfWeek = date.getDay();
          const isSunday = dayOfWeek === 0;
          const isSaturday = dayOfWeek === 6;
          const isHoliday = isKoreanHoliday(date);
          const isRedDay = isSunday || isSaturday || isHoliday;

          return (
            <div
              key={key}
              className={`calendar-day-cell ${!isCurrentMonth ? "other-month" : ""} ${
                isToday ? "today" : ""
              } ${isSelected ? "selected" : ""} ${isRedDay ? "red-day" : ""}`}
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
