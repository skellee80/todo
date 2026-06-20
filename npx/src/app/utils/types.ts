export interface HomeworkItem {
  id: string;
  title: string;
  kid: 'soyoon' | 'somin';
  date: string; // YYYY-MM-DD (시작 날짜 또는 단일 숙제 수행 날짜)
  time: string; // HH:MM (예: "14:30")
  isRecurring: boolean;
  recurringDays: number[]; // 0-6 (일요일=0, 월요일=1, ..., 토요일=6)
  alarmOption: 'none' | 'at_time' | '10_min' | '30_min' | '1_hour';
}

export interface HomeworkInstanceOverride {
  homeworkId: string;
  date: string; // YYYY-MM-DD
  completed: boolean;
  comment?: string;
  alarmOverride?: 'none' | 'at_time' | '10_min' | '30_min' | '1_hour';
}

/**
 * 특정 숙제가 지정된 날짜(YYYY-MM-DD)에 수행해야 하는 숙제인지 여부를 반환합니다.
 */
export function isHomeworkActiveOnDate(item: HomeworkItem, dateStr: string): boolean {
  // 등록 시작일보다 이전 날짜면 비활성
  if (dateStr < item.date) {
    return false;
  }

  // 단발성 숙제인 경우
  if (!item.isRecurring) {
    return item.date === dateStr;
  }

  // 반복성 숙제인 경우: 요일 매칭 체크
  const parts = dateStr.split('-').map(Number);
  if (parts.length !== 3) return false;
  
  // Date 생성 시 월은 0부터 시작하므로 parts[1] - 1
  const targetDate = new Date(parts[0], parts[1] - 1, parts[2]);
  const dayOfWeek = targetDate.getDay(); // 0: 일, 1: 월, ..., 6: 토
  
  return item.recurringDays.includes(dayOfWeek);
}
