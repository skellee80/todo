"use client";

import React, { useState, useEffect } from "react";
import { CalendarView } from "./components/CalendarView";
import { HomeworkModal } from "./components/HomeworkModal";
import { AlarmMonitor } from "./components/AlarmMonitor";
import { HomeworkItem, HomeworkInstanceOverride, KidNotificationSettings, isHomeworkActiveOnDate } from "./utils/types";
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
  updateAlarmOptionAll,
  updateHomeworkTime,
  updateHomeworkItemFields,
  setDeletedOverride,
  saveTitleOverride,
  subscribeKidNotificationSettings,
  saveKidNotificationSettings,
  subscribeNotice,
  saveNotice
} from "./utils/firebaseService";
import { registerPushNotification, unregisterPushNotification, updateAlarmPreference } from "./utils/webPush";
import { CompletionTimeModal } from "./components/CompletionTimeModal";

export default function HomeworkDiaryHome() {
  const [currentKid, setCurrentKid] = useState<"soyoon" | "somin">("soyoon");
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [isPushSubscribed, setIsPushSubscribed] = useState(false);
  const [alarmPreference, setAlarmPreference] = useState<"soyoon" | "somin" | "both">("both");
  
  // 전역 완료 시간 설정 관련 상태
  const [kidSettings, setKidSettings] = useState<KidNotificationSettings | null>(null);
  const [isCompletionModalOpen, setIsCompletionModalOpen] = useState(false);

  // 핵심 상태 변수 (실시간 DB 연동 대상)
  const [homeworkItems, setHomeworkItems] = useState<HomeworkItem[]>([]);
  const [overrides, setOverrides] = useState<Record<string, Record<string, HomeworkInstanceOverride>>>({});
  
  // 공지사항 메모장 관련 상태
  const [noticeContent, setNoticeContent] = useState("");
  const [isEditingNotice, setIsEditingNotice] = useState(false);
  const [tempNotice, setTempNotice] = useState("");
  
  // 모달 제어 상태 변수
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingAlarm, setEditingAlarm] = useState<{
    itemId: string;
    dateStr: string;
    currentAlarm: string;
    isRecurring: boolean;
  } | null>(null);
  const [editingTime, setEditingTime] = useState<{
    itemId: string;
    title: string;
    time: string;
  } | null>(null);
  const [editingTitle, setEditingTitle] = useState<{
    item: HomeworkItem;
    newTitle: string;
  } | null>(null);
  const [editingRecurring, setEditingRecurring] = useState<{
    itemId: string;
    title: string;
    recurringDays: number[];
  } | null>(null);
  const [deletingHomework, setDeletingHomework] = useState<{
    item: HomeworkItem;
  } | null>(null);

  // 알람 설정 변경 시 모달의 로컬 상태
  const [tempAlarms, setTempAlarms] = useState<string[]>([]);
  const [applyToAll, setApplyToAll] = useState(false);

  // 각 숙제의 사유 입력창을 제어하기 위한 로컬 상태 (itemId -> text)
  const [commentInputs, setCommentInputs] = useState<Record<string, string>>({});
  const [openCommentInputs, setOpenCommentInputs] = useState<Record<string, boolean>>({});

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

  // 2.5 가족 공지사항 실시간 구독
  useEffect(() => {
    const unsubscribeNotice = subscribeNotice((content) => {
      if (!isEditingNotice) {
        setNoticeContent(content);
        setTempNotice(content);
      }
    });
    return () => unsubscribeNotice();
  }, [isEditingNotice]);

  // 3. 아이별 완료 시간 전역 설정 실시간 구독
  useEffect(() => {
    const unsubscribeSettings = subscribeKidNotificationSettings(currentKid, (settings) => {
      setKidSettings(settings);
    });
    return () => unsubscribeSettings();
  }, [currentKid]);

  // 기동 시 이미 권한이 동의되어 있고 fcm_token이 있다면 구독 상태로 표시 및 토큰 자동 갱신
  useEffect(() => {
    if (typeof window !== "undefined") {
      const hasToken = !!localStorage.getItem("fcm_token");
      const hasPermission = "Notification" in window && Notification.permission === "granted";
      setIsPushSubscribed(hasToken && hasPermission);
      
      const storedPref = localStorage.getItem("alarm_preference") as "soyoon" | "somin" | "both" | null;
      if (storedPref) {
        setAlarmPreference(storedPref);
      }

      if (hasPermission) {
        registerPushNotification(storedPref || "both").catch(err => console.error("자동 푸시 갱신 실패:", err));
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

  // 알림 설정 단일 토글 스위치 핸들러
  const handleToggleKidPreference = async (target: "soyoon" | "somin") => {
    let nextPref: "soyoon" | "somin" | "both" | "none" = "none";
    
    // 현재 상태에서 타겟 요소를 반전하여 다음 상태 결정
    if (target === "soyoon") {
      if (alarmPreference === "both") {
        nextPref = "somin";
      } else if (alarmPreference === "soyoon") {
        nextPref = "none";
      } else if (alarmPreference === "somin") {
        nextPref = "both";
      } else {
        nextPref = "soyoon";
      }
    } else {
      // somin 토글
      if (alarmPreference === "both") {
        nextPref = "soyoon";
      } else if (alarmPreference === "somin") {
        nextPref = "none";
      } else if (alarmPreference === "soyoon") {
        nextPref = "both";
      } else {
        nextPref = "somin";
      }
    }

    try {
      if (nextPref === "none") {
        let success = true;
        if (isFirebaseConfigured) {
          success = await unregisterPushNotification();
        }
        if (success) {
          setAlarmPreference("none" as any); // 내부 관리 편의를 위해 'none' 세팅
          localStorage.setItem("alarm_preference", "none");
          setIsPushSubscribed(false);
          alert("모든 실시간 알림 수신이 해제되었습니다. 🔕");
        } else {
          alert("알림 해제에 실패했습니다.");
        }
      } else {
        // 새로 등록 혹은 갱신
        let token: string | null = "local_mock_token";
        if (isFirebaseConfigured) {
          token = await registerPushNotification(nextPref);
        } else {
          // 로컬 데모 모드일 때도 브라우저 알림 권한을 명시적으로 요청하여 노티바 구동 보장
          if (typeof window !== "undefined" && "Notification" in window) {
            const perm = await Notification.requestPermission();
            if (perm !== "granted") {
              alert("알림 권한이 허용되지 않았습니다. 브라우저 설정에서 권한을 승인해야 노티바 알림을 받을 수 있습니다. 🔔");
            }
          }
          // 로컬 데모 모드일 때는 스토리지를 직접 갱신하여 로컬 브라우저 알람 팝업 구동 보장
          localStorage.setItem("alarm_preference", nextPref);
        }

        if (token) {
          setAlarmPreference(nextPref);
          setIsPushSubscribed(true);
          
          let alertMsg = "";
          if (nextPref === "both") {
            alertMsg = "소윤이와 소민이 둘 다 알림을 받도록 설정되었습니다. 🔔";
          } else if (nextPref === "soyoon") {
            alertMsg = "소윤이의 알림만 받도록 설정되었습니다. 🔔";
          } else {
            alertMsg = "소민이의 알림만 받도록 설정되었습니다. 🔔";
          }
          alert(alertMsg + "\n스마트폰 알림 연동이 완료되었습니다! 🎉");
        } else {
          alert("알림 설정에 실패했습니다. 파이어베이스 인증 설정을 확인하세요.");
        }
      }
    } catch (error: any) {
      console.error("알림 토글 실패:", error);
      
      let errorMsg = "알림 설정 중 오류가 발생했습니다.";
      if (error.message === "INSECURE_CONTEXT") {
        errorMsg = "🔒 보안 연결(HTTPS)이 아닙니다.\n\n웹 푸시 알림 기능은 HTTPS 보안 연결 또는 개발용 localhost 환경에서만 작동합니다. 브라우저 접속 주소가 'https://'로 시작하는지 확인해 주세요.";
      } else if (error.message === "KAKAOTALK_BROWSER") {
        errorMsg = "🌐 카카오톡 인앱 브라우저는 알림 설정을 지원하지 않습니다.\n\n우측 하단의 더보기(...) 버튼을 누른 뒤 '다른 브라우저(Chrome, Safari 등)로 열기'를 선택하여 접속하신 후 다시 시도해 주세요!";
      } else if (error.message === "IOS_NOT_STANDALONE") {
        errorMsg = "📲 아이폰(iOS)에서 알림을 받으려면 앱을 '홈 화면에 추가'해야 합니다.\n\n[방법]\n1. Safari 브라우저 하단의 '공유 버튼(위 화살표 모양)'을 누릅니다.\n2. 메뉴에서 '홈 화면에 추가'를 클릭합니다.\n3. 홈 화면에 생성된 앱 아이콘으로 다시 접속하여 알림 설정을 켜 주세요! 🔔";
      } else if (error.message === "UNSUPPORTED_BROWSER") {
        errorMsg = "🚨 이 브라우저는 실시간 알림 기능을 지원하지 않습니다. 지원되는 브라우저(Chrome, Safari 등)로 다시 접속해 주세요.";
      } else if (error.message === "PERMISSION_DENIED") {
        errorMsg = "🚫 알림 권한이 거부되어 있습니다.\n\n브라우저 주소창 왼쪽의 자물쇠/설정 버튼 또는 스마트폰 설정에서 알림 권한을 '허용'으로 변경하신 후 다시 시도해 주세요. 🔔";
      } else if (error.message === "MISSING_VAPID_KEY" || error.message === "FIREBASE_NOT_CONFIGURED") {
        errorMsg = "⚙️ 파이어베이스 푸시(VAPID) 구성 정보가 설정되어 있지 않습니다. 관리자 환경변수 설정을 확인하세요.";
      } else if (error.message === "TOKEN_GENERATION_FAILED") {
        errorMsg = "🔑 알림 토큰 발급에 실패했습니다. 네트워크 상태를 확인하시거나 잠시 후 다시 시도해 주세요.";
      } else {
        errorMsg = `알림 연동에 실패했습니다:\n${error.message || error}`;
      }
      
      alert(errorMsg);
    }
  };

  // 날짜 문자열 변환 유틸리티 (로컬 기준 YYYY-MM-DD)
  const getLocalDateStr = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const r = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${r}`;
  };

  const getDayBeforeStr = (dateStr: string): string => {
    const d = new Date(dateStr);
    d.setDate(d.getDate() - 1);
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



  // 완료 상태 토글 및 스탬프 지정 처리
  const handleToggleComplete = async (itemId: string, currentCompleted: boolean, stampType: 'great' | 'sad') => {
    try {
      const dayOverride = overrides[selectedDateStr]?.[itemId];
      const currentStampType = dayOverride?.stampType || 'great';

      if (currentCompleted && currentStampType === stampType) {
        // 이미 해당 스탬프로 완료되었으면 체크 해제
        await toggleCompleteOverride(itemId, selectedDateStr, false);
      } else {
        // 새로 체크하거나 다른 스탬프로 변경
        await toggleCompleteOverride(itemId, selectedDateStr, true, stampType);
      }
    } catch (e) {
      console.error("상태 토글 실패:", e);
    }
  };

  // 사유 댓글 추가 처리 (인라인 입력 필드용)
  const handleAddCommentInline = async (itemId: string, existingComment?: string) => {
    const text = commentInputs[itemId] || "";
    const trimmed = text.trim();
    if (!trimmed) return;

    const newComment = existingComment ? `${existingComment}\n${trimmed}` : trimmed;
    try {
      await saveCommentOverride(itemId, selectedDateStr, newComment);
      // 입력창 비우고 닫기
      setCommentInputs((prev) => ({ ...prev, [itemId]: "" }));
      setOpenCommentInputs((prev) => ({ ...prev, [itemId]: false }));
    } catch (e) {
      console.error("사유 저장 실패:", e);
    }
  };

  // 숙제 시간 변경 처리
  const handleEditHomeworkTime = (item: HomeworkItem) => {
    setEditingTime({
      itemId: item.id,
      title: item.title,
      time: item.time,
    });
  };

  // 사유 댓글 삭제 처리 (줄 단위 삭제)
  const handleDeleteCommentLine = async (itemId: string, existingComment: string, lineIndex: number) => {
    const lines = existingComment.split("\n").filter((line) => line.trim() !== "");
    lines.splice(lineIndex, 1);
    const newComment = lines.join("\n");
    try {
      if (newComment === "") {
        await deleteCommentOverride(itemId, selectedDateStr);
      } else {
        await saveCommentOverride(itemId, selectedDateStr, newComment);
      }
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
    
    const initialAlarms = currentOption && currentOption !== "none" ? currentOption.split(",") : [];
    setTempAlarms(initialAlarms);
    setApplyToAll(!item.isRecurring); // 단발성이면 선택 불필요하므로 true 고정
  };

  // 알람 설정 변경 저장 처리 (서비스 위임)
  const handleSaveAlarmConfig = async () => {
    if (!editingAlarm) return;

    const { itemId, dateStr, isRecurring, currentAlarm } = editingAlarm;
    const finalAlarmOption = tempAlarms.length > 0 ? tempAlarms.join(",") : "none";

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
        await updateAlarmOptionAll(itemId, finalAlarmOption);
      } else {
        // 이번 일정에만 개별 적용
        await saveAlarmOverride(itemId, dateStr, finalAlarmOption);
      }
    } catch (e) {
      console.error("알람 변경 실패:", e);
    }

    setEditingAlarm(null);
  };

  // 선택된 날짜 및 현재 아이(소윤/소민) 기준 숙제 목록 필터링
  const activeHomeworkList = homeworkItems
    .filter((item) => {
      const isActive = item.kid === currentKid && isHomeworkActiveOnDate(item, selectedDateStr);
      if (!isActive) return false;
      const dayOverride = overrides[selectedDateStr]?.[item.id];
      if (dayOverride && dayOverride.deleted) return false;
      return true;
    })
    // 정렬: 숙제 이름 순
    .sort((a, b) => a.title.localeCompare(b.title));

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
              const stampType = dayOverride?.stampType || 'great';
              const comment = dayOverride?.comment;

              return (
                <div key={item.id} className={`homework-item-card ${isCompleted ? "completed" : ""}`}>
                  {/* 참 잘했어요 또는 아쉬워요 도장 도장 */}
                  <div className={`stamp-overlay ${stampType}`}>
                    {stampType === 'sad' ? '아쉬워요!' : '참 잘했어요!'}
                  </div>

                  <div className="homework-main-row">
                    <div className="homework-left">
                      {/* 완료 스탬프 선택기 */}
                      <div className="stamp-selector-buttons">
                        <button
                          type="button"
                          className={`stamp-select-btn great ${isCompleted && stampType === 'great' ? 'active' : ''}`}
                          onClick={() => handleToggleComplete(item.id, isCompleted, 'great')}
                          title="참 잘했어요!"
                        >
                          💮
                        </button>
                        <button
                          type="button"
                          className={`stamp-select-btn sad ${isCompleted && stampType === 'sad' ? 'active' : ''}`}
                          onClick={() => handleToggleComplete(item.id, isCompleted, 'sad')}
                          title="아쉬워요!"
                        >
                          😢
                        </button>
                      </div>

                      {/* 숙제 상세 내용 */}
                      <div className="homework-info">
                        <div 
                          className="homework-title"
                          style={{ cursor: "pointer" }}
                          title="클릭하여 숙제 이름을 변경하세요"
                          onClick={() => setEditingTitle({
                            item,
                            newTitle: dayOverride?.titleOverride || item.title
                          })}
                        >
                          {dayOverride?.titleOverride || item.title}
                        </div>
                        <div className="homework-meta">
                          {item.isRecurring && (
                            <span 
                              className="meta-badge recurring"
                              style={{ cursor: "pointer" }}
                              title="클릭하여 반복 요일을 수정하세요"
                              onClick={() => setEditingRecurring({
                                itemId: item.id,
                                title: item.title,
                                recurringDays: [...item.recurringDays]
                              })}
                            >
                              🔁 매주 ({item.recurringDays.map((d) => ["일", "월", "화", "수", "목", "금", "토"][d]).join(", ")})
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="homework-right">
                      {!isCompleted && (
                        <button 
                          className="cute-btn" 
                          style={{ padding: "6px 12px", fontSize: "0.8rem", borderRadius: "10px", background: "#f8f9fa", borderBottomColor: "#dee2e6", color: "#495057" }}
                          onClick={() => {
                            setOpenCommentInputs(prev => ({
                              ...prev,
                              [item.id]: !prev[item.id]
                            }));
                          }}
                        >
                          💬 댓글
                        </button>
                      )}
                      {/* 숙제 삭제 버튼 */}
                      <button
                        className="delete-btn"
                        onClick={() => setDeletingHomework({ item })}
                        title="숙제 삭제"
                      >
                        🗑️
                      </button>
                    </div>
                  </div>

                  {/* 댓글 직접 입력 영역 */}
                  {openCommentInputs[item.id] && (
                    <div className="comment-input-row" style={{ marginTop: "8px", marginBottom: "8px" }}>
                      <input
                        type="text"
                        className="comment-input"
                        placeholder="댓글 또는 사유를 입력하세요..."
                        value={commentInputs[item.id] || ""}
                        onChange={(e) => setCommentInputs({
                          ...commentInputs,
                          [item.id]: e.target.value
                        })}
                        onKeyDown={async (e) => {
                          if (e.key === 'Enter') {
                            await handleAddCommentInline(item.id, comment);
                          }
                        }}
                        autoFocus
                      />
                      <button
                        className={`cute-btn ${currentKid === "soyoon" ? "primary-soyoon" : "primary-somin"}`}
                        style={{ padding: "6px 12px", borderRadius: "12px", fontSize: "0.85rem" }}
                        onClick={() => handleAddCommentInline(item.id, comment)}
                      >
                        등록
                      </button>
                    </div>
                  )}

                  {/* 사유 댓글 영역 */}
                  {comment && (
                    <div className="comment-area" style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: "6px" }}>
                      {comment.split("\n").map((line, idx) => {
                        const trimmedLine = line.trim();
                        if (!trimmedLine) return null;
                        return (
                          <div key={idx} className="comment-bubble" style={{ marginBottom: 0 }}>
                            <span>💬 {trimmedLine}</span>
                            <span 
                              style={{ marginLeft: "8px", color: "#fa5252", cursor: "pointer", fontSize: "0.85rem" }}
                              onClick={() => handleDeleteCommentLine(item.id, comment, idx)}
                              title="사유 지우기"
                            >
                              [지우기]
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </section>

      {/* 실시간 스마트폰 알림 설정 영역 (페이지 최하단) */}
      {isFirebaseConfigured && (
        <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: "10px", marginTop: "12px", marginBottom: "12px", flexWrap: "wrap" }}>
          <button 
            className="cute-btn"
            style={{ fontSize: "1rem", padding: "12px 24px", borderRadius: "20px", background: "#faf8f5", borderBottomColor: "#cbd5e1" }}
            onClick={() => setIsCompletionModalOpen(true)}
          >
            ⏰ 완료 시간 설정
          </button>
          
          {currentKid === "soyoon" ? (
            <button 
              className={`cute-btn ${(alarmPreference === "soyoon" || alarmPreference === "both") ? "primary-soyoon" : ""}`}
              style={{ padding: "12px 24px", fontSize: "1rem", borderRadius: "20px" }}
              onClick={() => handleToggleKidPreference("soyoon")}
            >
              🌸 소윤이 알림 {(alarmPreference === "soyoon" || alarmPreference === "both") ? "ON" : "OFF"}
            </button>
          ) : (
            <button 
              className={`cute-btn ${(alarmPreference === "somin" || alarmPreference === "both") ? "primary-somin" : ""}`}
              style={{ padding: "12px 24px", fontSize: "1rem", borderRadius: "20px" }}
              onClick={() => handleToggleKidPreference("somin")}
            >
              💧 소민이 알림 {(alarmPreference === "somin" || alarmPreference === "both") ? "ON" : "OFF"}
            </button>
          )}
        </div>
      )}

      {/* 공지사항 / 메모장 영역 */}
      <section className="cute-card notice-section" style={{ marginTop: "24px" }}>
        <div className="notice-header">
          <h3 className="notice-title">📌 가족 공지사항 & 메모장</h3>
          <span className="notice-sync-badge">☁️ 실시간 동기화</span>
        </div>
        
        {isEditingNotice ? (
          <div className="notice-editor">
            <textarea
              className="notice-textarea"
              value={tempNotice}
              onChange={(e) => setTempNotice(e.target.value)}
              placeholder="여기에 가족들에게 공유할 공지사항이나 메모를 입력해 보세요..."
              rows={4}
              maxLength={1000}
            />
            <div className="notice-actions">
              <button 
                type="button"
                className="cute-btn"
                style={{ background: "#cbd5e1", borderBottomColor: "#94a3b8" }}
                onClick={() => {
                  setTempNotice(noticeContent);
                  setIsEditingNotice(false);
                }}
              >
                취소
              </button>
              <button 
                type="button"
                className={`cute-btn ${currentKid === 'soyoon' ? 'primary-soyoon' : 'primary-somin'}`}
                onClick={async () => {
                  try {
                    await saveNotice(tempNotice);
                    setIsEditingNotice(false);
                  } catch (e) {
                    console.error("공지사항 저장 실패:", e);
                    alert("저장에 실패했습니다.");
                  }
                }}
              >
                저장 완료 🎉
              </button>
            </div>
          </div>
        ) : (
          <div className="notice-display" onClick={() => {
            setTempNotice(noticeContent);
            setIsEditingNotice(true);
          }} title="클릭하여 수정하기">
            {noticeContent ? (
              <div className="notice-text-content">
                {noticeContent.split("\n").map((line, idx) => (
                  <p key={idx}>{line || <br />}</p>
                ))}
              </div>
            ) : (
              <p className="notice-placeholder">✏️ 등록된 공지사항이 없습니다. 이곳을 클릭하여 첫 메모를 작성해보세요!</p>
            )}
            <div className="notice-edit-hint">✏️ 클릭하여 수정하기</div>
          </div>
        )}
      </section>

      {/* 숙제 등록 모달창 */}
      <HomeworkModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onSave={handleSaveHomework}
        defaultKid={currentKid}
        defaultDate={selectedDate}
      />

      {/* 요일별 완료 예정 시간 설정 모달창 */}
      <CompletionTimeModal
        isOpen={isCompletionModalOpen}
        onClose={() => setIsCompletionModalOpen(false)}
        kid={currentKid}
        initialSettings={kidSettings}
        onSave={saveKidNotificationSettings}
      />

      {/* 반복 요일 변경 모달창 */}
      {editingRecurring && (
        <div className="modal-overlay" onClick={() => setEditingRecurring(null)}>
          <div 
            className={`modal-content ${currentKid === 'soyoon' ? 'theme-soyoon' : 'theme-somin'}`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <h3 className="modal-title">🔁 반복 요일 변경</h3>
              <button className="close-btn" onClick={() => setEditingRecurring(null)}>
                ✖
              </button>
            </div>

            <div className="form-group">
              <label className="form-label" style={{ fontSize: "1.1rem" }}>✍ {editingRecurring.title}</label>
            </div>

            <div className="form-group">
              <label className="form-label">🗓️ 어떤 요일에 반복할까요?</label>
              <div className="days-select-grid">
                {[
                  { label: "일", value: 0 },
                  { label: "월", value: 1 },
                  { label: "화", value: 2 },
                  { label: "수", value: 3 },
                  { label: "목", value: 4 },
                  { label: "금", value: 5 },
                  { label: "토", value: 6 },
                ].map((day) => {
                  const isChecked = editingRecurring.recurringDays.includes(day.value);
                  return (
                    <label
                      key={day.value}
                      className={`day-checkbox-label ${isChecked ? "checked" : ""}`}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => {
                          const days = editingRecurring.recurringDays.includes(day.value)
                            ? editingRecurring.recurringDays.filter((d) => d !== day.value)
                            : [...editingRecurring.recurringDays, day.value];
                          setEditingRecurring({ ...editingRecurring, recurringDays: days });
                        }}
                      />
                      {day.label}
                    </label>
                  );
                })}
              </div>
            </div>

            <div style={{ fontSize: "0.85rem", color: "#868e96", marginBottom: "12px", lineHeight: "1.4" }}>
              * 변경하시면 <strong>오늘({selectedDate.getFullYear()}년 {selectedDate.getMonth() + 1}월 {selectedDate.getDate()}일) 이후</strong> 날짜부터 새 설정이 적용되며, 이전 숙제 내역은 원래대로 안전하게 유지됩니다.
            </div>

            <div className="modal-actions">
              <button
                type="button"
                className="cute-btn"
                onClick={() => setEditingRecurring(null)}
                style={{ background: "#e2e8f0", borderBottomColor: "#cbd5e1" }}
              >
                취소
              </button>
              <button
                type="button"
                className={`cute-btn ${currentKid === "soyoon" ? "primary-soyoon" : "primary-somin"}`}
                onClick={async () => {
                  if (editingRecurring.recurringDays.length === 0) {
                    alert("반복할 요일을 하나 이상 선택해 주세요! 🗓️");
                    return;
                  }
                  
                  const originalItem = homeworkItems.find(h => h.id === editingRecurring.itemId);
                  if (!originalItem) return;

                  try {
                    if (selectedDateStr <= originalItem.date) {
                      await updateHomeworkItemFields(originalItem.id, {
                        recurringDays: editingRecurring.recurringDays
                      });
                    } else {
                      const yesterday = getDayBeforeStr(selectedDateStr);
                      await updateHomeworkItemFields(originalItem.id, {
                        endDate: yesterday
                      });

                      await addHomeworkItem({
                        title: originalItem.title,
                        kid: originalItem.kid,
                        date: selectedDateStr,
                        time: originalItem.time,
                        isRecurring: true,
                        recurringDays: editingRecurring.recurringDays,
                        alarmOption: originalItem.alarmOption
                      });
                    }
                    alert("반복 요일이 정상적으로 변경되었습니다. 🔁");
                  } catch (e) {
                    console.error(e);
                    alert("반복 일정 변경에 실패했습니다.");
                  }
                  setEditingRecurring(null);
                }}
              >
                변경 완료 🎉
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 숙제 이름 변경 모달창 */}
      {editingTitle && (
        <div className="modal-overlay" onClick={() => setEditingTitle(null)}>
          <div 
            className={`modal-content ${currentKid === 'soyoon' ? 'theme-soyoon' : 'theme-somin'}`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <h3 className="modal-title">✍ 숙제 이름 변경</h3>
              <button className="close-btn" onClick={() => setEditingTitle(null)}>
                ✖
              </button>
            </div>

            <div className="form-group">
              <label className="form-label">✍ 새로운 숙제 이름</label>
              <input
                type="text"
                className="form-input"
                value={editingTitle.newTitle}
                onChange={(e) => setEditingTitle({ ...editingTitle, newTitle: e.target.value })}
                required
                autoFocus
              />
            </div>

            <div className="modal-actions" style={{ flexDirection: "column", gap: "8px", marginTop: "16px" }}>
              {editingTitle.item.isRecurring ? (
                <>
                  <button
                    type="button"
                    className={`cute-btn ${currentKid === "soyoon" ? "primary-soyoon" : "primary-somin"}`}
                    style={{ width: "100%", padding: "12px 0" }}
                    onClick={async () => {
                      const newTitle = editingTitle.newTitle.trim();
                      if (!newTitle) {
                        alert("숙제 이름을 입력해 주세요! 📝");
                        return;
                      }
                      try {
                        await saveTitleOverride(editingTitle.item.id, selectedDateStr, newTitle);
                        alert("오늘 하루 숙제 이름이 변경되었습니다. ✍");
                      } catch (e) {
                        console.error(e);
                        alert("오늘 이름 변경 실패");
                      }
                      setEditingTitle(null);
                    }}
                  >
                    오늘 하루만 이름 변경
                  </button>
                  <button
                    type="button"
                    className="cute-btn"
                    style={{ width: "100%", padding: "12px 0", background: "#ff8787", color: "white", borderBottomColor: "#fa5252" }}
                    onClick={async () => {
                      const newTitle = editingTitle.newTitle.trim();
                      if (!newTitle) {
                        alert("숙제 이름을 입력해 주세요! 📝");
                        return;
                      }
                      try {
                        if (selectedDateStr <= editingTitle.item.date) {
                          await updateHomeworkItemFields(editingTitle.item.id, { title: newTitle });
                        } else {
                          const yesterday = getDayBeforeStr(selectedDateStr);
                          await updateHomeworkItemFields(editingTitle.item.id, { endDate: yesterday });
                          await addHomeworkItem({
                            title: newTitle,
                            kid: editingTitle.item.kid,
                            date: selectedDateStr,
                            time: editingTitle.item.time,
                            isRecurring: true,
                            recurringDays: editingTitle.item.recurringDays,
                            alarmOption: editingTitle.item.alarmOption
                          });
                        }
                        alert("오늘부터 이후 모든 반복 숙제 이름이 변경되었습니다. 🔁");
                      } catch (e) {
                        console.error(e);
                        alert("이후 이름 변경 실패");
                      }
                      setEditingTitle(null);
                    }}
                  >
                    오늘부터 이후 일정 모두 변경
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className={`cute-btn ${currentKid === "soyoon" ? "primary-soyoon" : "primary-somin"}`}
                  style={{ width: "100%", padding: "12px 0" }}
                  onClick={async () => {
                    const newTitle = editingTitle.newTitle.trim();
                    if (!newTitle) {
                      alert("숙제 이름을 입력해 주세요! 📝");
                      return;
                    }
                    try {
                      await updateHomeworkItemFields(editingTitle.item.id, { title: newTitle });
                      alert("숙제 이름이 변경되었습니다. ✍");
                    } catch (e) {
                      console.error(e);
                      alert("숙제 이름 변경 실패");
                    }
                    setEditingTitle(null);
                  }}
                >
                  변경 완료 🎉
                </button>
              )}
              <button
                type="button"
                className="cute-btn"
                onClick={() => setEditingTitle(null)}
                style={{ width: "100%", padding: "12px 0", background: "#e2e8f0", borderBottomColor: "#cbd5e1" }}
              >
                취소
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 숙제 삭제 모달창 */}
      {deletingHomework && (
        <div className="modal-overlay" onClick={() => setDeletingHomework(null)}>
          <div 
            className={`modal-content ${currentKid === 'soyoon' ? 'theme-soyoon' : 'theme-somin'}`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <h3 className="modal-title">🗑️ 숙제 삭제</h3>
              <button className="close-btn" onClick={() => setDeletingHomework(null)}>
                ✖
              </button>
            </div>

            <div className="form-group">
              <p style={{ fontSize: "1.1rem", color: "#4a3b32", lineHeight: "1.5" }}>
                <strong>[{deletingHomework.item.title}]</strong> 숙제를 삭제하시겠습니까?
              </p>
              {deletingHomework.item.isRecurring && (
                <p style={{ fontSize: "0.85rem", color: "#e03131", marginTop: "6px" }}>
                  * 이 숙제는 매주 반복되는 숙제입니다.
                </p>
              )}
            </div>

            <div className="modal-actions" style={{ flexDirection: "column", gap: "8px", marginTop: "16px" }}>
              {deletingHomework.item.isRecurring ? (
                <>
                  <button
                    type="button"
                    className={`cute-btn ${currentKid === "soyoon" ? "primary-soyoon" : "primary-somin"}`}
                    style={{ width: "100%", padding: "12px 0" }}
                    onClick={async () => {
                      try {
                        await setDeletedOverride(deletingHomework.item.id, selectedDateStr, true);
                        alert("오늘 하루 숙제가 삭제되었습니다. 🗑️");
                      } catch (e) {
                        console.error(e);
                        alert("오늘 일정 삭제 실패");
                      }
                      setDeletingHomework(null);
                    }}
                  >
                    🗑️ 오늘 하루만 숙제 삭제
                  </button>
                  <button
                    type="button"
                    className="cute-btn"
                    style={{ width: "100%", padding: "12px 0", background: "#ff8787", color: "white", borderBottomColor: "#fa5252" }}
                    onClick={async () => {
                      try {
                        if (selectedDateStr <= deletingHomework.item.date) {
                          await deleteHomeworkItem(deletingHomework.item.id);
                        } else {
                          const yesterday = getDayBeforeStr(selectedDateStr);
                          await updateHomeworkItemFields(deletingHomework.item.id, {
                            endDate: yesterday
                          });
                        }
                        alert("오늘 이후의 모든 반복 일정이 삭제되었습니다. 🗑️");
                      } catch (e) {
                        console.error(e);
                        alert("이후 일정 삭제 실패");
                      }
                      setDeletingHomework(null);
                    }}
                  >
                    🗑️ 오늘부터 이후 일정 모두 삭제
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className={`cute-btn ${currentKid === "soyoon" ? "primary-soyoon" : "primary-somin"}`}
                  style={{ width: "100%", padding: "12px 0" }}
                  onClick={async () => {
                    try {
                      await deleteHomeworkItem(deletingHomework.item.id);
                      alert("숙제가 삭제되었습니다. 🗑️");
                    } catch (e) {
                      console.error(e);
                      alert("숙제 삭제 실패");
                    }
                    setDeletingHomework(null);
                  }}
                >
                  🗑️ 삭제하기
                </button>
              )}
              <button
                type="button"
                className="cute-btn"
                onClick={() => setDeletingHomework(null)}
                style={{ width: "100%", padding: "12px 0", background: "#e2e8f0", borderBottomColor: "#cbd5e1" }}
              >
                취소
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
