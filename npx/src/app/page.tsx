"use client";

import React, { useState, useEffect } from "react";
import { CalendarView } from "./components/CalendarView";
import { HomeworkModal } from "./components/HomeworkModal";
import { AlarmMonitor } from "./components/AlarmMonitor";
import { HomeworkItem, HomeworkInstanceOverride, isHomeworkActiveOnDate } from "./utils/types";
import { isFirebaseConfigured } from "./utils/firebase";
import {
  subscribeHomeworkItems,
  subscribeOverrides,
  addHomeworkItem,
  deleteHomeworkItem,
  toggleCompleteOverride,
  saveCommentOverride,
  deleteCommentOverride,
  saveAlarmOverride,
  updateAlarmOptionAll
} from "./utils/firebaseService";
import { registerPushNotification, unregisterPushNotification } from "./utils/webPush";

export default function HomeworkDiaryHome() {
  const [currentKid, setCurrentKid] = useState<"soyoon" | "somin">("soyoon");
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [isPushSubscribed, setIsPushSubscribed] = useState(false);
  
  // 핵심 상태 변수 (실시간 DB 연동 대상)
  const [homeworkItems, setHomeworkItems] = useState<HomeworkItem[]>([]);
  const [overrides, setOverrides] = useState<Record<string, Record<string, HomeworkInstanceOverride>>>({});
  
  // 모달 제어 상태 변수
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingAlarm, setEditingAlarm] = useState<{
    itemId: string;
    dateStr: string;
    currentAlarm: "none" | "at_time" | "10_min" | "30_min" | "1_hour";
    isRecurring: boolean;
  } | null>(null);

  // 알람 설정 변경 시 모달의 로컬 상태
  const [tempAlarmOption, setTempAlarmOption] = useState<
    "none" | "at_time" | "10_min" | "30_min" | "1_hour"
  >("none");
  const [applyToAll, setApplyToAll] = useState(false);

  // 각 숙제의 사유 입력창을 제어하기 위한 로컬 상태 (itemId -> text)
  const [commentInputs, setCommentInputs] = useState<Record<string, string>>({});

  // 파이어베이스 / 로컬스토리지 실시간 구독 설정
  useEffect(() => {
    // 1. 숙제 목록 실시간 구독
    const unsubscribeHomework = subscribeHomeworkItems((items) => {
      setHomeworkItems(items);
    });

    // 2. 완료여부 및 사유 오버라이드 실시간 구독
    const unsubscribeOverrides = subscribeOverrides((ovs) => {
      setOverrides(ovs);
    });

    return () => {
      unsubscribeHomework();
      unsubscribeOverrides();
    };
  }, []);

  // 기동 시 이미 권한이 동의되어 있고 fcm_token이 있다면 구독 상태로 표시 및 토큰 자동 갱신
  useEffect(() => {
    if (typeof window !== "undefined") {
      const hasToken = !!localStorage.getItem("fcm_token");
      const hasPermission = "Notification" in window && Notification.permission === "granted";
      setIsPushSubscribed(hasToken && hasPermission);
      if (hasPermission) {
        registerPushNotification().catch(err => console.error("자동 푸시 갱신 실패:", err));
      }
    }
  }, []);

  // 테마 바디 클래스 업데이트
  useEffect(() => {
    document.body.className = `theme-${currentKid}`;
  }, [currentKid]);

  // 날짜 사이의 모든 YYYY-MM-DD 목록 반환 (시작일 포함, 종료일 제외)
  const getDatesBetween = (startStr: string, endStr: string): string[] => {
    const dates: string[] = [];
    const start = new Date(startStr);
    const end = new Date(endStr);
    
    let current = new Date(start.getTime());
    while (current < end) {
      const y = current.getFullYear();
      const m = String(current.getMonth() + 1).padStart(2, "0");
      const d = String(current.getDate()).padStart(2, "0");
      dates.push(`${y}-${m}-${d}`);
      current.setDate(current.getDate() + 1);
    }
    return dates;
  };

  // 실시간 알림 토글 핸들러
  const handleTogglePush = async () => {
    if (isPushSubscribed) {
      try {
        const success = await unregisterPushNotification();
        if (success) {
          setIsPushSubscribed(false);
          alert("실시간 알림 수신이 해제되었습니다. 🔕");
        } else {
          alert("알림 해제에 실패했습니다.");
        }
      } catch (error) {
        console.error("알림 해제 실패:", error);
        alert("알림 해제 중 오류가 발생했습니다.");
      }
    } else {
      try {
        const token = await registerPushNotification();
        if (token) {
          setIsPushSubscribed(true);
          alert("실시간 스마트폰 알림 연동에 성공했습니다! 🎉\n이제 브라우저 창을 닫아도 시간에 맞춰 알림이 전송됩니다. 🔔");
        } else {
          alert("알림 설정에 실패했습니다. 파이어베이스 웹 푸시 VAPID 인증서 키 설정을 확인해 주세요.");
        }
      } catch (error) {
        alert("알림 권한이 거부되었거나 설정 중 오류가 발생했습니다. 브라우저 설정에서 이 사이트의 알림 권한을 확인해 주세요.");
      }
    }
  };

  // 날짜 문자열 변환 유틸리티 (로컬 기준 YYYY-MM-DD)
  const getLocalDateStr = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const r = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${r}`;
  };

  const selectedDateStr = getLocalDateStr(selectedDate);

  // 날짜 요일 한글 텍스트 반환
  const getDayNameKo = (d: Date) => {
    const days = ["일", "월", "화", "수", "목", "금", "토"];
    return days[d.getDay()];
  };

  // 신규 숙제 등록 처리 (서비스 위임)
  const handleSaveHomework = async (newFields: Omit<HomeworkItem, "id">) => {
    try {
      await addHomeworkItem(newFields);
    } catch (e) {
      console.error("숙제 등록 실패:", e);
      alert("숙제를 등록하지 못했습니다. 😢");
    }
  };

  // 숙제 삭제 처리 (서비스 위임)
  const handleDeleteHomework = async (itemId: string, isRecurring: boolean) => {
    try {
      if (isRecurring) {
        const confirmAll = window.confirm("이 숙제는 매주 반복되는 일정입니다.\n'확인'을 누르면 앞으로의 모든 반복 일정을 삭제하고,\n'취소'를 누르면 오늘 하루만 숙제에서 제외(삭제)합니다.");
        if (confirmAll) {
          await deleteHomeworkItem(itemId);
        } else {
          // 오늘 하루만 숙제 제외 처리 (댓글 사유 오버라이드로 제외 표기)
          await saveCommentOverride(itemId, selectedDateStr, "🚫 이번 숙제 패스! (이 항목은 제외되었습니다)");
        }
      } else {
        if (window.confirm("이 숙제를 삭제할까요?")) {
          await deleteHomeworkItem(itemId);
        }
      }
    } catch (e) {
      console.error("숙제 삭제 실패:", e);
      alert("숙제를 삭제하지 못했습니다.");
    }
  };

  // 완료 상태 토글 처리 (서비스 위임)
  const handleToggleComplete = async (itemId: string, currentCompleted: boolean) => {
    try {
      await toggleCompleteOverride(itemId, selectedDateStr, !currentCompleted);
    } catch (e) {
      console.error("상태 토글 실패:", e);
    }
  };

  // 사유 댓글 추가 처리 (서비스 위임)
  const handleAddComment = async (itemId: string) => {
    const commentText = commentInputs[itemId]?.trim();
    if (!commentText) return;

    try {
      await saveCommentOverride(itemId, selectedDateStr, commentText);
      setCommentInputs({ ...commentInputs, [itemId]: "" });
    } catch (e) {
      console.error("사유 저장 실패:", e);
    }
  };

  // 사유 댓글 삭제 처리 (서비스 위임)
  const handleDeleteComment = async (itemId: string) => {
    try {
      await deleteCommentOverride(itemId, selectedDateStr);
    } catch (e) {
      console.error("사유 삭제 실패:", e);
    }
  };

  // 알람 클릭 시 수정 준비 모달 띄우기
  const handleOpenAlarmEdit = (item: HomeworkItem) => {
    const dayOverride = overrides[selectedDateStr]?.[item.id];
    const currentOption = dayOverride?.alarmOverride !== undefined 
      ? dayOverride.alarmOverride 
      : item.alarmOption;

    setEditingAlarm({
      itemId: item.id,
      dateStr: selectedDateStr,
      currentAlarm: currentOption,
      isRecurring: item.isRecurring,
    });
    setTempAlarmOption(currentOption);
    setApplyToAll(!item.isRecurring); // 단발성이면 선택 불필요하므로 true 고정
  };

  // 알람 설정 변경 저장 처리 (서비스 위임)
  const handleSaveAlarmConfig = async () => {
    if (!editingAlarm) return;

    const { itemId, dateStr, isRecurring, currentAlarm } = editingAlarm;

    try {
      if (isRecurring && applyToAll) {
        // 모든 일정에 일괄 적용 (단, 이전 일정들의 알람 방식은 이전 설정값으로 고정)
        const item = homeworkItems.find((h) => h.id === itemId);
        if (item) {
          const pastDates = getDatesBetween(item.date, dateStr);
          for (const d of pastDates) {
            if (isHomeworkActiveOnDate(item, d)) {
              const existingOverride = overrides[d]?.[itemId];
              if (!existingOverride || existingOverride.alarmOverride === undefined) {
                await saveAlarmOverride(itemId, d, currentAlarm);
              }
            }
          }
        }
        await updateAlarmOptionAll(itemId, tempAlarmOption);
      } else {
        // 이번 일정에만 개별 적용
        await saveAlarmOverride(itemId, dateStr, tempAlarmOption);
      }
    } catch (e) {
      console.error("알람 변경 실패:", e);
    }

    setEditingAlarm(null);
  };

  // 선택된 날짜 및 현재 아이(소윤/소민) 기준 숙제 목록 필터링
  const activeHomeworkList = homeworkItems
    .filter((item) => item.kid === currentKid && isHomeworkActiveOnDate(item, selectedDateStr))
    // 정렬: 시간 순
    .sort((a, b) => a.time.localeCompare(b.time));

  const currentKidLabel = currentKid === "soyoon" ? "소윤이" : "소민이";

  return (
    <main className="container">
      {/* 백그라운드 알람 체크 서비스 */}
      <AlarmMonitor homeworkItems={homeworkItems} overrides={overrides} />

      {/* 파이어베이스 연결 유효성 안내 배너 */}
      {!isFirebaseConfigured && (
        <div style={{
          background: "#fff9db",
          border: "2px dashed #f59f00",
          borderRadius: "16px",
          padding: "12px 18px",
          fontSize: "0.9rem",
          color: "#856404",
          textAlign: "center",
          fontFamily: "inherit",
          lineHeight: "1.4"
        }}>
          ⚠️ <strong>파이어베이스 환경 변수 미설정 상태</strong><br />
          현재 로컬 브라우저 저장소 모드로 작동 중입니다. 배포 시 파이어베이스 환경변수를 등록하시면 실시간 클라우드 동기화 모드가 활성화됩니다.
        </div>
      )}

      {/* 헤더 부분 */}
      <header className="app-header">
        <h1 className="app-title">🏡 소소한 가족의 📝 숙제 다이어리</h1>
      </header>

      {/* 소윤이 & 소민이 토글 영역 */}
      <div className="toggle-wrapper">
        <div className={`kid-toggle ${currentKid === "soyoon" ? "toggle-soyoon" : "toggle-somin"}`}>
          <button className="kid-btn kid-btn-soyoon" onClick={() => setCurrentKid("soyoon")}>
            🌸 소윤이 달력
          </button>
          <button className="kid-btn kid-btn-somin" onClick={() => setCurrentKid("somin")}>
            💧 소민이 달력
          </button>
        </div>
      </div>

      {/* 달력 영역 */}
      <CalendarView
        currentKid={currentKid}
        selectedDate={selectedDate}
        setSelectedDate={setSelectedDate}
        homeworkItems={homeworkItems}
        overrides={overrides}
      />

      {/* 하단 상세 "오늘의 할 일" 영역 */}
      <section className="cute-card detail-section">
        <div className="detail-title-row">
          <h3 className="detail-title">
            📅 {selectedDate.getFullYear()}년 {selectedDate.getMonth() + 1}월 {selectedDate.getDate()}일 ({getDayNameKo(selectedDate)})
            <span style={{ fontSize: "1rem", color: currentKid === "soyoon" ? "#ff8787" : "#4dadf7", fontWeight: "bold", marginLeft: "6px" }}>
              [{currentKidLabel}]의 할 일
            </span>
          </h3>
          <button
            className={`cute-btn ${currentKid === "soyoon" ? "primary-soyoon" : "primary-somin"}`}
            onClick={() => setIsAddModalOpen(true)}
          >
            ➕ 숙제 추가하기
          </button>
        </div>

        {/* 숙제 리스트 */}
        <div className="homework-list">
          {activeHomeworkList.length === 0 ? (
            <div className="empty-homework">
              <span className="empty-graphic">🎉</span>
              <p>이날은 등록된 숙제가 없어요!</p>
              <p style={{ fontSize: "1rem", color: "#adb5bd" }}>신나게 놀거나 새로운 숙제를 추가해 보세요 🎈</p>
            </div>
          ) : (
            activeHomeworkList.map((item) => {
              const dayOverride = overrides[selectedDateStr]?.[item.id];
              const isCompleted = dayOverride ? dayOverride.completed : false;
              const comment = dayOverride?.comment;
              const activeAlarmOption = dayOverride?.alarmOverride !== undefined 
                ? dayOverride.alarmOverride 
                : item.alarmOption;

              // 알람 레이블 변환
              let alarmText = "알람 없음";
              if (activeAlarmOption === "at_time") alarmText = "정시 알람";
              else if (activeAlarmOption === "10_min") alarmText = "10분 전 알람";
              else if (activeAlarmOption === "30_min") alarmText = "30분 전 알람";
              else if (activeAlarmOption === "1_hour") alarmText = "1시간 전 알람";

              return (
                <div key={item.id} className={`homework-item-card ${isCompleted ? "completed" : ""}`}>
                  {/* 참 잘했어요 도장 도장 */}
                  <div className="stamp-overlay">참 잘했어요!</div>

                  <div className="homework-main-row">
                    <div className="homework-left">
                      {/* 완료 토글용 예쁜 체크박스 */}
                      <label className="cute-checkbox-label">
                        <input
                          type="checkbox"
                          className="cute-checkbox"
                          checked={isCompleted}
                          onChange={() => handleToggleComplete(item.id, isCompleted)}
                        />
                        <span className="checkmark"></span>
                      </label>

                      {/* 숙제 상세 내용 */}
                      <div className="homework-info">
                        <div className="homework-title">{item.title}</div>
                        <div className="homework-meta">
                          <span className="meta-badge time">⏰ {item.time}</span>
                          {item.isRecurring && (
                            <span className="meta-badge recurring">
                              🔁 매주 ({item.recurringDays.map((d) => ["일", "월", "화", "수", "목", "금", "토"][d]).join(", ")})
                            </span>
                          )}
                          <span 
                            className="meta-badge alarm" 
                            style={{ cursor: "pointer" }}
                            title="클릭하여 알람 설정을 수정하세요"
                            onClick={() => handleOpenAlarmEdit(item)}
                          >
                            🔔 {alarmText} ⚙
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* 숙제 삭제 버튼 */}
                    <button
                      className="delete-btn"
                      onClick={() => handleDeleteHomework(item.id, item.isRecurring)}
                      title="숙제 삭제"
                    >
                      🗑️
                    </button>
                  </div>

                  {/* 사유 댓글 영역 */}
                  <div className="comment-area">
                    {comment ? (
                      <div className="comment-bubble">
                        💬 <strong>사유:</strong> {comment}
                        <span 
                          style={{ marginLeft: "8px", color: "#fa5252", cursor: "pointer", fontSize: "0.85rem" }}
                          onClick={() => handleDeleteComment(item.id)}
                          title="사유 지우기"
                        >
                          [지우기]
                        </span>
                      </div>
                    ) : (
                      !isCompleted && (
                        <div className="comment-input-row">
                          <input
                            type="text"
                            className="comment-input"
                            placeholder="숙제가 지연되거나 사유가 있으면 입력해 주세요 (예: 학원 보강이 있어요)"
                            value={commentInputs[item.id] || ""}
                            onChange={(e) => setCommentInputs({ ...commentInputs, [item.id]: e.target.value })}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") handleAddComment(item.id);
                            }}
                          />
                          <button
                            className="cute-btn"
                            style={{ padding: "6px 12px", fontSize: "0.9rem" }}
                            onClick={() => handleAddComment(item.id)}
                          >
                            등록
                          </button>
                        </div>
                      )
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </section>

      {/* 실시간 스마트폰 알림 설정 영역 (페이지 최하단) */}
      {isFirebaseConfigured && (
        <div style={{ display: "flex", justifyContent: "center", marginTop: "12px", marginBottom: "12px" }}>
          <button 
            className={`cute-btn ${currentKid === "soyoon" ? "primary-soyoon" : "primary-somin"}`}
            style={{ fontSize: "1rem", padding: "12px 24px", borderRadius: "20px" }}
            onClick={handleTogglePush}
          >
            {isPushSubscribed ? "🔕 알림 끄기" : "🔔 알림 받기"}
          </button>
        </div>
      )}

      {/* 숙제 등록 모달창 */}
      <HomeworkModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onSave={handleSaveHomework}
        defaultKid={currentKid}
        defaultDate={selectedDate}
      />

      {/* 알람 설정 수정 모달창 */}
      {editingAlarm && (
        <div className="modal-overlay" onClick={() => setEditingAlarm(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">🔔 알람 설정 변경</h3>
              <button className="close-btn" onClick={() => setEditingAlarm(null)}>
                ✖
              </button>
            </div>

            <div className="form-group">
              <label className="form-label">미리 알림 방식 선택</label>
              <select
                className="form-input"
                value={tempAlarmOption}
                onChange={(e) => setTempAlarmOption(e.target.value as any)}
                style={{ background: "#ffffff", appearance: "auto" }}
              >
                <option value="none">알림 없음</option>
                <option value="at_time">정시에 알려주기</option>
                <option value="10_min">10분 전에 알려주기</option>
                <option value="30_min">30분 전에 알려주기</option>
                <option value="1_hour">1시간 전에 알려주기</option>
              </select>
            </div>

            {editingAlarm.isRecurring && (
              <div className="form-group" style={{ flexDirection: "row", alignItems: "center" }}>
                <input
                  type="checkbox"
                  id="apply-to-all-checkbox"
                  style={{ marginRight: "8px", width: "18px", height: "18px", cursor: "pointer" }}
                  checked={applyToAll}
                  onChange={(e) => setApplyToAll(e.target.checked)}
                />
                <label htmlFor="apply-to-all-checkbox" style={{ cursor: "pointer", fontSize: "0.95rem" }}>
                  앞으로의 모든 반복 일정에 적용할까요?
                </label>
              </div>
            )}
            {!editingAlarm.isRecurring && (
              <p style={{ fontSize: "0.85rem", color: "#868e96", marginBottom: "12px" }}>
                * 단일 일정이므로 이 일정에만 즉시 적용됩니다.
              </p>
            )}

            <div className="modal-actions">
              <button
                className="cute-btn"
                onClick={() => setEditingAlarm(null)}
                style={{ background: "#e2e8f0", borderBottomColor: "#cbd5e1" }}
              >
                취소
              </button>
              <button
                className={`cute-btn ${currentKid === "soyoon" ? "primary-soyoon" : "primary-somin"}`}
                onClick={handleSaveAlarmConfig}
              >
                변경 완료 🎉
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
