import { 
  collection, 
  doc, 
  setDoc, 
  deleteDoc, 
  updateDoc, 
  onSnapshot, 
  deleteField,
  writeBatch
} from "firebase/firestore";
import { db, isFirebaseConfigured } from "./firebase";
import { HomeworkItem, HomeworkInstanceOverride, KidNotificationSettings } from "./types";

// 기본 더미 데이터 정의 (로컬스토리지 전용 초기값)
const DEFAULT_SETTINGS = (kid: 'soyoon' | 'somin'): KidNotificationSettings => ({
  kid,
  weeklyCompletionTimes: Array(7).fill("18:00")
});

type HomeworkCallback = (items: HomeworkItem[]) => void;
type OverridesCallback = (overrides: Record<string, Record<string, HomeworkInstanceOverride>>) => void;
type SettingsCallback = (settings: KidNotificationSettings) => void;

const homeworkListeners = new Set<HomeworkCallback>();
const overridesListeners = new Set<OverridesCallback>();
const settingsListeners = new Set<SettingsCallback>();

const DEFAULT_HOMEWORK: HomeworkItem[] = [
  {
    id: "dummy-1",
    title: "영어 단어 10개 외우기",
    kid: "soyoon",
    date: "2026-06-01",
    time: "15:00",
    isRecurring: true,
    recurringDays: [2, 4], // 화, 목
    alarmOption: "1_hour",
  },
  {
    id: "dummy-2",
    title: "독서록 1페이지 쓰기",
    kid: "soyoon",
    date: "2026-06-20", // 오늘
    time: "17:00",
    isRecurring: false,
    recurringDays: [],
    alarmOption: "none",
  },
  {
    id: "dummy-3",
    title: "피아노 바이엘 연습",
    kid: "somin",
    date: "2026-06-01",
    time: "14:30",
    isRecurring: true,
    recurringDays: [1, 3, 5], // 월, 수, 금
    alarmOption: "at_time,1_hour",
  },
  {
    id: "dummy-4",
    title: "받아쓰기 10문제 복습",
    kid: "somin",
    date: "2026-06-20", // 오늘
    time: "19:00",
    isRecurring: false,
    recurringDays: [],
    alarmOption: "at_time",
  }
];

function getLocalSettings(kid: 'soyoon' | 'somin'): KidNotificationSettings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS(kid);
  const stored = localStorage.getItem(`kid_settings_${kid}`);
  if (stored) {
    return JSON.parse(stored);
  }
  const defaultVal = DEFAULT_SETTINGS(kid);
  localStorage.setItem(`kid_settings_${kid}`, JSON.stringify(defaultVal));
  return defaultVal;
}

// 로컬 데이터 읽기 헬퍼
function getLocalHomework(): HomeworkItem[] {
  if (typeof window === "undefined") return [];
  const stored = localStorage.getItem("homework_items");
  if (stored) {
    return JSON.parse(stored);
  }
  localStorage.setItem("homework_items", JSON.stringify(DEFAULT_HOMEWORK));
  return DEFAULT_HOMEWORK;
}

function getLocalOverrides(): Record<string, Record<string, HomeworkInstanceOverride>> {
  if (typeof window === "undefined") return {};
  const stored = localStorage.getItem("homework_overrides");
  return stored ? JSON.parse(stored) : {};
}

// 로컬 변경 전파 헬퍼
function notifyHomeworkListeners(items: HomeworkItem[]) {
  homeworkListeners.forEach(cb => cb(items));
}

function notifyOverridesListeners(ovs: Record<string, Record<string, HomeworkInstanceOverride>>) {
  overridesListeners.forEach(cb => cb(ovs));
}

function notifySettingsListeners(settings: KidNotificationSettings) {
  settingsListeners.forEach(cb => {
    try {
      if (typeof cb === "function") {
        cb(settings);
      }
    } catch (e) {
      console.error("Settings listener execution error:", e);
    }
  });
}


/**
 * 1. 숙제 목록 실시간 구독
 */
export function subscribeHomeworkItems(callback: HomeworkCallback): () => void {
  if (isFirebaseConfigured && db) {
    // 파이어베이스 실시간 동기화
    const colRef = collection(db, "homework");
    return onSnapshot(colRef, (snapshot) => {
      const items: HomeworkItem[] = [];
      snapshot.forEach((doc) => {
        items.push({ id: doc.id, ...doc.data() } as HomeworkItem);
      });
      callback(items);
    }, (error) => {
      console.error("숙제 구독 중 에러 발생:", error);
    });
  } else {
    // 로컬스토리지 폴백 구독
    homeworkListeners.add(callback);
    // 초기 로드값 반환
    callback(getLocalHomework());
    return () => {
      homeworkListeners.delete(callback);
    };
  }
}

/**
 * 2. 완료 여부 및 사유 오버라이드 실시간 구독
 */
export function subscribeOverrides(callback: OverridesCallback): () => void {
  if (isFirebaseConfigured && db) {
    // 파이어베이스 실시간 동기화
    const colRef = collection(db, "overrides");
    return onSnapshot(colRef, (snapshot) => {
      const ovs: Record<string, Record<string, HomeworkInstanceOverride>> = {};
      snapshot.forEach((doc) => {
        const data = doc.data() as HomeworkInstanceOverride;
        if (!ovs[data.date]) {
          ovs[data.date] = {};
        }
        ovs[data.date][data.homeworkId] = data;
      });
      callback(ovs);
    }, (error) => {
      console.error("오버라이드 구독 중 에러 발생:", error);
    });
  } else {
    // 로컬스토리지 폴백 구독
    overridesListeners.add(callback);
    // 초기 로드값 반환
    callback(getLocalOverrides());
    return () => {
      overridesListeners.delete(callback);
    };
  }
}

/**
 * 3. 숙제 추가
 */
export async function addHomeworkItem(item: Omit<HomeworkItem, "id">): Promise<string> {
  const id = `hw-${Math.random().toString(36).substring(2, 9)}`;
  const newItem: HomeworkItem = { ...item, id };

  if (isFirebaseConfigured && db) {
    const docRef = doc(db, "homework", id);
    await setDoc(docRef, {
      title: newItem.title,
      kid: newItem.kid,
      date: newItem.date,
      time: newItem.time,
      isRecurring: newItem.isRecurring,
      recurringDays: newItem.recurringDays,
      alarmOption: newItem.alarmOption,
      createdAt: Date.now()
    });
  } else {
    const items = getLocalHomework();
    const updated = [...items, newItem];
    localStorage.setItem("homework_items", JSON.stringify(updated));
    notifyHomeworkListeners(updated);
  }
  return id;
}

/**
 * 4. 숙제 영구 삭제
 */
export async function deleteHomeworkItem(itemId: string): Promise<void> {
  if (isFirebaseConfigured && db) {
    // 숙제 삭제
    await deleteDoc(doc(db, "homework", itemId));

    // 이 숙제에 지정되어 있던 오버라이드 내역도 삭제 (파이어스토어 정리 목적)
    // 실제 운영 시 배치나 서브쿼리로 정리할 수 있지만 단순하게 처리
    console.log(`숙제 ${itemId}가 파이어스토어에서 삭제되었습니다.`);
  } else {
    // 로컬 삭제
    const items = getLocalHomework();
    const updated = items.filter(item => item.id !== itemId);
    localStorage.setItem("homework_items", JSON.stringify(updated));
    notifyHomeworkListeners(updated);

    // 오버라이드 정리
    const ovs = getLocalOverrides();
    let changed = false;
    Object.keys(ovs).forEach(dateKey => {
      if (ovs[dateKey]?.[itemId]) {
        delete ovs[dateKey][itemId];
        changed = true;
      }
    });
    if (changed) {
      localStorage.setItem("homework_overrides", JSON.stringify(ovs));
      notifyOverridesListeners(ovs);
    }
  }
}

/**
 * 5. 특정 날짜의 숙제 완료 상태 토글
 */
export async function toggleCompleteOverride(
  itemId: string, 
  dateStr: string, 
  completed: boolean
): Promise<void> {
  const docId = `${dateStr}_${itemId}`;

  if (isFirebaseConfigured && db) {
    const docRef = doc(db, "overrides", docId);
    await setDoc(docRef, {
      homeworkId: itemId,
      date: dateStr,
      completed: completed
    }, { merge: true });
  } else {
    const ovs = getLocalOverrides();
    if (!ovs[dateStr]) {
      ovs[dateStr] = {};
    }
    ovs[dateStr][itemId] = {
      ...(ovs[dateStr][itemId] || { homeworkId: itemId, date: dateStr }),
      completed: completed
    };
    localStorage.setItem("homework_overrides", JSON.stringify(ovs));
    notifyOverridesListeners(ovs);
  }
}

/**
 * 6. 특정 날짜의 숙제 사유(댓글) 저장
 */
export async function saveCommentOverride(
  itemId: string, 
  dateStr: string, 
  commentText: string
): Promise<void> {
  const docId = `${dateStr}_${itemId}`;

  if (isFirebaseConfigured && db) {
    const docRef = doc(db, "overrides", docId);
    await setDoc(docRef, {
      homeworkId: itemId,
      date: dateStr,
      comment: commentText
    }, { merge: true });
  } else {
    const ovs = getLocalOverrides();
    if (!ovs[dateStr]) {
      ovs[dateStr] = {};
    }
    ovs[dateStr][itemId] = {
      ...(ovs[dateStr][itemId] || { homeworkId: itemId, date: dateStr, completed: false }),
      comment: commentText
    };
    localStorage.setItem("homework_overrides", JSON.stringify(ovs));
    notifyOverridesListeners(ovs);
  }
}

/**
 * 7. 특정 날짜의 숙제 사유(댓글) 삭제
 */
export async function deleteCommentOverride(itemId: string, dateStr: string): Promise<void> {
  const docId = `${dateStr}_${itemId}`;

  if (isFirebaseConfigured && db) {
    const docRef = doc(db, "overrides", docId);
    // 완료 여부가 없거나 false이고, 알람 오버라이드도 없다면 문서 자체를 지우는 것이 효율적
    // 그렇지 않다면 comment 필드만 지워줌
    const ovs = getLocalOverrides(); // 참조용으로 로컬 데이터 임시 확인
    const currentOverride = ovs[dateStr]?.[itemId];
    
    const hasCompleted = currentOverride?.completed;
    const hasAlarm = currentOverride?.alarmOverride !== undefined;

    if (!hasCompleted && !hasAlarm) {
      await deleteDoc(docRef);
    } else {
      await updateDoc(docRef, {
        comment: deleteField()
      });
    }
  } else {
    const ovs = getLocalOverrides();
    if (ovs[dateStr]?.[itemId]) {
      ovs[dateStr][itemId].comment = undefined;

      const hasCompleted = ovs[dateStr][itemId].completed;
      const hasAlarm = ovs[dateStr][itemId].alarmOverride !== undefined;
      if (!hasCompleted && !hasAlarm) {
        delete ovs[dateStr][itemId];
      }
    }
    localStorage.setItem("homework_overrides", JSON.stringify(ovs));
    notifyOverridesListeners(ovs);
  }
}

/**
 * 8. 특정 날짜에 대해서만 알람 옵션 덮어쓰기
 */
export async function saveAlarmOverride(
  itemId: string, 
  dateStr: string, 
  alarmOption: string
): Promise<void> {
  const docId = `${dateStr}_${itemId}`;

  if (isFirebaseConfigured && db) {
    const docRef = doc(db, "overrides", docId);
    await setDoc(docRef, {
      homeworkId: itemId,
      date: dateStr,
      alarmOverride: alarmOption
    }, { merge: true });
  } else {
    const ovs = getLocalOverrides();
    if (!ovs[dateStr]) {
      ovs[dateStr] = {};
    }
    ovs[dateStr][itemId] = {
      ...(ovs[dateStr][itemId] || { homeworkId: itemId, date: dateStr, completed: false }),
      alarmOverride: alarmOption
    };
    localStorage.setItem("homework_overrides", JSON.stringify(ovs));
    notifyOverridesListeners(ovs);
  }
}

/**
 * 9. 전체 반복 일정에 대한 알람 옵션 변경
 */
export async function updateAlarmOptionAll(
  itemId: string, 
  alarmOption: string
): Promise<void> {
  if (isFirebaseConfigured && db) {
    const docRef = doc(db, "homework", itemId);
    await updateDoc(docRef, {
      alarmOption: alarmOption
    });
  } else {
    const items = getLocalHomework();
    const updated = items.map(item => {
      if (item.id === itemId) {
        return { ...item, alarmOption };
      }
      return item;
    });
    localStorage.setItem("homework_items", JSON.stringify(updated));
    notifyHomeworkListeners(updated);
  }
}

/**
 * 10. 숙제 시작 예정 시간 변경
 */
export async function updateHomeworkTime(itemId: string, newTime: string): Promise<void> {
  if (isFirebaseConfigured && db) {
    const docRef = doc(db, "homework", itemId);
    await updateDoc(docRef, {
      time: newTime
    });
  } else {
    const items = getLocalHomework();
    const updated = items.map(item => {
      if (item.id === itemId) {
        return { ...item, time: newTime };
      }
      return item;
    });
    localStorage.setItem("homework_items", JSON.stringify(updated));
    notifyHomeworkListeners(updated);
  }
}

/**
 * 11. 숙제 필드 일괄/개별 변경 (종료일 설정 및 반복 요일 변경용)
 */
export async function updateHomeworkItemFields(
  itemId: string,
  fields: Partial<HomeworkItem> & { endDate?: string | null }
): Promise<void> {
  if (isFirebaseConfigured && db) {
    const docRef = doc(db, "homework", itemId);
    const updateData: any = { ...fields };
    if (fields.endDate === null) {
      updateData.endDate = deleteField();
    }
    await updateDoc(docRef, updateData);
  } else {
    const items = getLocalHomework();
    const updated = items.map(item => {
      if (item.id === itemId) {
        const newItem = { ...item, ...fields };
        if (fields.endDate === null) {
          delete newItem.endDate;
        }
        return newItem;
      }
      return item;
    });
    localStorage.setItem("homework_items", JSON.stringify(updated));
    notifyHomeworkListeners(updated);
  }
}

/**
 * 12. 특정 날짜의 숙제 삭제(제외) 여부 저장
 */
export async function setDeletedOverride(
  itemId: string,
  dateStr: string,
  deleted: boolean
): Promise<void> {
  const docId = `${dateStr}_${itemId}`;

  if (isFirebaseConfigured && db) {
    const docRef = doc(db, "overrides", docId);
    await setDoc(docRef, {
      homeworkId: itemId,
      date: dateStr,
      deleted: deleted
    }, { merge: true });
  } else {
    const ovs = getLocalOverrides();
    if (!ovs[dateStr]) {
      ovs[dateStr] = {};
    }
    ovs[dateStr][itemId] = {
      ...(ovs[dateStr][itemId] || { homeworkId: itemId, date: dateStr, completed: false }),
      deleted: deleted
    };
    localStorage.setItem("homework_overrides", JSON.stringify(ovs));
    notifyOverridesListeners(ovs);
  }
}

/**
 * 14. 아이별 숙제 완료 시간 전역 설정 실시간 구독
 */
export function subscribeKidNotificationSettings(
  kid: 'soyoon' | 'somin',
  callback: (settings: KidNotificationSettings) => void
): () => void {
  // 로컬 리스너 래퍼 생성 및 등록
  const wrapper = (settings: KidNotificationSettings) => {
    if (settings.kid === kid) {
      callback(settings);
    }
  };
  settingsListeners.add(wrapper);
  
  // 로컬 저장 값으로 초기 통지
  callback(getLocalSettings(kid));

  let unsubscribeFirebase: (() => void) | null = null;

  if (isFirebaseConfigured && db) {
    const docRef = doc(db, "notification_settings", kid);
    unsubscribeFirebase = onSnapshot(docRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data() as KidNotificationSettings;
        // Firestore 원격 데이터를 로컬스토리지에 미러링
        localStorage.setItem(`kid_settings_${kid}`, JSON.stringify(data));
        callback(data);
      } else {
        const defaultVal = DEFAULT_SETTINGS(kid);
        setDoc(docRef, defaultVal).then(() => {
          callback(defaultVal);
        }).catch(err => console.error("기본 설정 저장 실패:", err));
      }
    }, (error) => {
      console.error(`${kid} 설정 구독 중 에러 발생:`, error);
    });
  }

  return () => {
    settingsListeners.delete(wrapper);
    if (unsubscribeFirebase) {
      unsubscribeFirebase();
    }
  };
}

/**
 * 15. 아이별 숙제 완료 시간 전역 설정 저장
 */
export async function saveKidNotificationSettings(settings: KidNotificationSettings): Promise<void> {
  try {
    if (isFirebaseConfigured && db) {
      const docRef = doc(db, "notification_settings", settings.kid);
      await setDoc(docRef, settings, { merge: true });
    }
  } catch (err) {
    console.error("Firestore 저장 실패, 로컬에 백업합니다:", err);
  } finally {
    // 파이어베이스에 상관없이 로컬에 무조건 저장하여 저장 오류 팝업 발생 차단
    localStorage.setItem(`kid_settings_${settings.kid}`, JSON.stringify(settings));
    notifySettingsListeners(settings);
  }
}


/**
 * 13. 특정 날짜의 숙제 이름(타이틀) 오버라이드 저장
 */
export async function saveTitleOverride(
  itemId: string,
  dateStr: string,
  titleText: string
): Promise<void> {
  const docId = `${dateStr}_${itemId}`;

  if (isFirebaseConfigured && db) {
    const docRef = doc(db, "overrides", docId);
    await setDoc(docRef, {
      homeworkId: itemId,
      date: dateStr,
      titleOverride: titleText
    }, { merge: true });
  } else {
    const ovs = getLocalOverrides();
    if (!ovs[dateStr]) {
      ovs[dateStr] = {};
    }
    ovs[dateStr][itemId] = {
      ...(ovs[dateStr][itemId] || { homeworkId: itemId, date: dateStr, completed: false }),
      titleOverride: titleText
    };
    localStorage.setItem("homework_overrides", JSON.stringify(ovs));
    notifyOverridesListeners(ovs);
  }
}
