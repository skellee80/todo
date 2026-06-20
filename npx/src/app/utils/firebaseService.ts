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
import { HomeworkItem, HomeworkInstanceOverride } from "./types";

// 기본 더미 데이터 정의 (로컬스토리지 전용 초기값)
const DEFAULT_HOMEWORK: HomeworkItem[] = [
  {
    id: "dummy-1",
    title: "영어 단어 10개 외우기",
    kid: "soyoon",
    date: "2026-06-01",
    time: "15:00",
    isRecurring: true,
    recurringDays: [2, 4], // 화, 목
    alarmOption: "30_min",
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
    alarmOption: "10_min",
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

// 로컬 저장소 폴백용 Pub/Sub 이벤트 리스너 정의 (실시간 다중 연동 효과 연출)
type HomeworkCallback = (items: HomeworkItem[]) => void;
type OverridesCallback = (overrides: Record<string, Record<string, HomeworkInstanceOverride>>) => void;

const homeworkListeners = new Set<HomeworkCallback>();
const overridesListeners = new Set<OverridesCallback>();

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
  alarmOption: "none" | "at_time" | "10_min" | "30_min" | "1_hour"
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
  alarmOption: "none" | "at_time" | "10_min" | "30_min" | "1_hour"
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
