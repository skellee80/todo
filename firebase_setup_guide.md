# 📝 소소한 가족의 숙제 다이어리 - 파이어베이스(Firebase) 설정 가이드

본 가이드는 **Next.js**로 구축된 "소소한 가족의 숙제 다이어리" 애플리케이션을 파이어베이스(Firebase)에 배포하고 연동하기 위해 필요한 모든 설정을 초보자도 쉽게 따라 할 수 있도록 단계별로 설명합니다.

---

## 🗺️ 전체 흐름 요약
1. **[1단계]** 파이어베이스 프로젝트 생성 및 웹 앱 등록
2. **[2단계]** Firestore Database 구축 및 보안 규칙 설정
3. **[3단계]** 웹 푸시(FCM) 인증 키 발급
4. **[4단계]** 로컬 환경 변수(`.env.local`) 설정
5. **[5단계]** GitHub 연동 및 Firebase App Hosting 생성
6. **[6단계]** App Hosting 환경 변수 및 비밀 키 설정
7. **[7단계]** (FCM 알림용) 서버 서비스 계정 및 스케줄러 크론 설정

---

## 1단계. 파이어베이스 프로젝트 생성 및 웹 앱 등록

1. **파이어베이스 콘솔 접속**
   * [Firebase Console](https://console.firebase.google.com/)에 구글 계정으로 로그인합니다.
2. **프로젝트 만들기**
   * **[프로젝트 추가]** 버튼을 클릭합니다.
   * 프로젝트 이름(예: `soso-homework`)을 입력하고 **[계속]**을 누릅니다.
   * Google Analytics(구글 애널리틱스) 설정은 선택 사항입니다. (가족용 간단한 다이어리이므로 비활성화해도 무방합니다.)
   * **[프로젝트 만들기]**를 클릭하고 완료될 때까지 기다린 후 **[계속]**을 누릅니다.
3. **웹 앱(Web) 추가하기**
   * 프로젝트 메인 홈 화면 중앙에서 **웹 아이콘 `</>`**을 클릭합니다.
   * 앱 닉네임(예: `soso-homework-web`)을 입력합니다.
   * "이 앱에 Firebase Hosting도 설정합니다." 체크박스는 **해제**해 둡니다. (우리는 최신 Next.js 서버 배포를 지원하는 **App Hosting**을 사용할 것입니다.)
   * **[앱 등록]** 버튼을 누릅니다.
4. **접속 비밀키(Firebase Config) 복사**
   * 화면에 등장하는 `firebaseConfig` 객체 코드를 따로 메모장 등에 복사해 둡니다.
     ```javascript
     const firebaseConfig = {
       apiKey: "AIzaSy...",
       authDomain: "...",
       projectId: "...",
       storageBucket: "...",
       messagingSenderId: "...",
       appId: "..."
     };
     ```
   * 복사 후 **[콘솔로 이동]**을 클릭합니다.

---

## 2단계. Firestore Database 구축 및 보안 규칙 설정

숙제 일정과 기기 정보, 알림 설정 등이 저장될 데이터베이스를 생성하고, 보안 규칙을 설정합니다.

1. **Firestore 시작하기**
   * 왼쪽 사이드바 메뉴에서 **[빌드]** -> **[Firestore Database]**를 클릭합니다.
   * **[데이터베이스 만들기]** 버튼을 클릭합니다.
2. **위치 및 모드 설정**
   * **보안 규칙**: 우선 **[프로덕션 모드에서 시작]** 또는 **[테스트 모드에서 시작]** 중 아무거나 선택합니다. (어차피 아래에서 규칙을 직접 덮어쓸 것입니다.)
   * **위치 설정**: `asia-northeast3` (서울) 또는 `asia-east1` 등 본인과 가장 가까운 아시아 지역을 선택하고 **[만들기]**를 클릭합니다.
3. **보안 규칙(Security Rules) 적용**
   * Firestore 화면 상단의 **[규칙(Rules)]** 탭으로 이동합니다.
   * 기존에 작성된 텍스트를 모두 지우고, 아래의 **가족 다이어리 전용 규칙**을 입력합니다.
   * 이 앱은 로그인(Auth) 기능이 없이 온가족이 공용으로 주소를 쳐서 들어와 사용하는 형태이므로, 무제한 쓰기 허용 대신 각 컬렉션 구조에 맞게 읽기/쓰기를 열어주어야 합니다.

   ```javascript
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       
       // 1. homework 컬렉션 규칙
       // - 개별 숙제 문서 및 설정용 문서('settings_soyoon', 'settings_somin', 'settings_family_notice')
       match /homework/{document} {
         allow read, write: if true;
       }
       
       // 2. overrides 컬렉션 규칙
       // - 날짜별 숙제 완료/댓글/삭제 상태 오버라이드
       match /overrides/{document} {
         allow read, write: if true;
       }
       
       // 3. devices 컬렉션 규칙
       // - 푸시 알림 수신을 등록한 브라우저 기기 FCM 토큰
       match /devices/{document} {
         allow read, write: if true;
       }
     }
   }
   ```
   * 입력 후 우측 상단의 **[게시(Publish)]** 버튼을 클릭하여 적용합니다.

> [!WARNING]
> 이 규칙은 로그인 없이 주소만 알면 누구나 데이터를 편집할 수 있는 공개 모드 규칙입니다. 가족 전용 앱이므로 주소가 타인에게 노출되지 않는다면 문제 없이 작동하지만, 향후 완전한 보안이 필요한 경우에는 Firebase Authentication(구글 로그인 등)을 도입하여 `if request.auth != null` 등의 로그인 필터를 추가하는 것을 권장합니다.

---

## 3단계. 웹 푸시(FCM) 인증 키 발급

자녀의 숙제 예정 시간에 브라우저 푸시 알림을 띄워주기 위해 필요한 VAPID(웹 푸시용 자격증명) 키를 생성합니다.

1. **프로젝트 설정 이동**
   * 왼쪽 사이드바 맨 위 톱니바퀴 아이콘 **[프로젝트 설정]**을 클릭합니다.
2. **클라우드 메시징 설정**
   * 상단 탭 중 **[클라우드 메시징(Cloud Messaging)]**을 클릭합니다.
3. **웹 푸시 인증서 발급**
   * 화면 아래쪽 **[웹 구성(Web configuration)]** 영역으로 스크롤합니다.
   * **웹 푸시 인증서** 항목의 **[키 쌍 생성(Generate key pair)]** 버튼을 누릅니다.
   * 잠시 후 생성된 긴 문자열 키가 화면에 표시됩니다. (예: `BI6OSuaW57...`)
   * 이 값을 **VAPID Key**로 사용하게 되므로 따로 기록해 둡니다.

---

## 4단계. 로컬 환경 변수(`.env.local`) 설정

로컬 컴퓨터에서 Next.js를 실행하고 파이어베이스와 연동하기 위해 환경 변수 파일을 준비합니다.

1. 프로젝트 내의 `npx` 폴더 아래에 `.env.local` 파일을 생성(혹은 수정)합니다.
2. 1단계와 3단계에서 메모해 둔 키들을 매핑하여 아래 형식으로 입력합니다.

```env
# 파이어베이스 클라이언트 접속 키 (1단계에서 획득)
NEXT_PUBLIC_FIREBASE_API_KEY=AIzaSyDSAh3pDUxzUAz72vseYK6cQSob5Lcy6Gk
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=sosohomwork.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=sosohomwork
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=sosohomwork.firebasestorage.app
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=343328000049
NEXT_PUBLIC_FIREBASE_APP_ID=1:343328000049:web:8a7174514946402a10ad10

# 웹 푸시 연동용 VAPID Key (3단계에서 획득)
NEXT_PUBLIC_FIREBASE_VAPID_KEY=BI6OSuaW57aj-Zbb_9q5UcFkCsMxk1fMpI70ltSCSMlxEFOIgtxgjkdX7UX_SqiFu-ga5l6PjfIiwFl-mdRurY8
```

> [!NOTE]
> `.env.local` 파일은 로컬 컴퓨터 개발 환경(`npm run dev`)에서만 적용되는 파일이며, 보안을 위해 `.gitignore`에 포함되어 GitHub에 올라가지 않습니다. 운영 서버 배포를 위해서는 별도의 환경 변수 입력 과정(6단계)이 필요합니다.

---

## 5단계. GitHub 연동 및 Firebase App Hosting 생성

소스 코드를 GitHub에 업로드한 뒤, 파이어베이스의 차세대 호스팅 서비스인 **App Hosting**을 연결합니다.

1. **GitHub 리포지토리 생성 및 코드 업로드**
   * 본인의 GitHub 계정에 비어있는 새 원격 저장소(예: `my-homework-diary`)를 생성합니다.
   * 로컬의 프로젝트 루트 폴더에서 아래 명령어들을 실행해 코드를 푸시합니다.
     ```bash
     git init
     git remote add origin https://github.com/사용자이름/저장소이름.git
     git branch -M main
     git add .
     git commit -m "Initial commit"
     git push -u origin main -f
     ```
2. **App Hosting 메뉴 접속**
   * 파이어베이스 콘솔 사이드바에서 **[빌드]** -> **[App Hosting]**을 클릭합니다.
   * **[시작하기]** 버튼을 누릅니다.
3. **GitHub 계정 연동 및 저장소 선택**
   * GitHub 연동 과정을 진행하고 본인의 GitHub 계정을 연결합니다.
   * 방금 코드를 푸시한 저장소(Repository)와 배포할 브랜치(`main`)를 선택한 뒤 **[다음]**을 누릅니다.
4. **배포 설정 지정 (매우 중요 🌟)**
   * **웹 자산의 루트 디렉터리 설정**:
     * 우리 프로젝트 구조는 루트 폴더 아래에 `npx`라는 하위 폴더 형태로 Next.js 파일들이 모여있습니다.
     * 따라서 루트 디렉터리 입력칸에 반드시 **`npx`**라고 입력해 주어야 파이어베이스가 `package.json`을 읽고 서버를 빌드할 수 있습니다.
   * **백엔드 서비스 이름**: 기본값으로 둔 채 **[다음]**을 누릅니다.
5. **App Hosting 리소스 생성**
   * **[배포(Deploy)]** 버튼을 클릭하면, 파이어베이스가 자동으로 GitHub의 최신 소스 코드를 가져와 클라우드 빌드를 시작합니다.
   * 첫 빌드와 배포에는 약 3~5분 정도 소요됩니다.

---

## 6단계. App Hosting 환경 변수 및 비밀 키 설정

빌드가 진행되는 동안, 클라우드 호스팅 서버가 파이어베이스 데이터베이스에 접근할 수 있도록 서버 환경 변수를 주입해 주어야 합니다.

1. **App Hosting 대시보드 진입**
   * 생성된 호스팅 백엔드(예: `soso-homework`) 카드/상세를 클릭하여 대시보드로 진입합니다.
2. **설정(Settings) 탭 이동**
   * 상단의 탭 중 **[설정(Settings)]**을 클릭합니다.
3. **환경 변수(Environment Variables) 추가**
   * 화면 중간의 **[환경 변수(Environment Variables)]** 또는 **[환경 변수 추가(Add Variable)]** 버튼을 클릭합니다.
   * 4단계에서 로컬 `.env.local`에 기재했던 변수들을 **이름(Key)**과 **값(Value)** 형태로 하나씩 동일하게 추가합니다.
     * `NEXT_PUBLIC_FIREBASE_API_KEY` = `AIzaSy...`
     * `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` = `sosohomwork.firebaseapp.com`
     * `NEXT_PUBLIC_FIREBASE_PROJECT_ID` = `sosohomwork`
     * `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` = `sosohomwork.firebasestorage.app`
     * `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` = `343328000049`
     * `NEXT_PUBLIC_FIREBASE_APP_ID` = `1:343328000049:web:8a7174514946402a10ad10`
     * `NEXT_PUBLIC_FIREBASE_VAPID_KEY` = `BI6OSuaW57...`
   * 모든 변수를 등록한 뒤 **[저장(Save)]**을 누릅니다.
4. **최신 버전 재배포**
   * 환경 변수를 반영하기 위해 대시보드 홈으로 이동하여 우측 상단의 **[배포(Deploy)]** 또는 GitHub에 비어있는 커밋을 푸시하여 자동 트리거를 수행해 재배포를 완료합니다.
   * 배포 완료 후 제공되는 도메인(`.hosted.app` 또는 `.web.app`) 주소로 이동하여 달력과 일정 입력 기능이 작동하는지 테스트합니다.

---

## 7단계. 서버 서비스 계정 및 스케줄러 크론 설정

서버 측 `/api/send-alarms` API Route가 매분 자동으로 동작하며 오늘 해야 할 숙제를 계산하고, 미완료 상태인 경우 대상 브라우저들에게 백그라운드 푸시 알림을 발송하도록 설정합니다.

### 7-1. Firebase Admin 권한 확인 (Cloud Run 서비스 계정)
Firebase App Hosting은 내부적으로 Google Cloud의 **Cloud Run**을 사용합니다. App Hosting이 생성되면 자동으로 기본 서비스 계정(Service Account)이 만들어져 데이터베이스와 메시징 기능 권한을 획득합니다.
* 별도로 복잡한 서비스 계정 JSON 파일을 생성하여 환경 변수에 밀어넣지 않아도, App Hosting 서버 내부에서 `admin.initializeApp()` 호출 시 클라우드 디폴트 인증 자격이 자동 연동됩니다. (우리 코드의 `/api/send-alarms/route.ts`에 이미 이 자동 폴백 로직이 설계되어 있습니다.)

### 7-2. [선택 A] 구글 클라우드 스케줄러(Cloud Scheduler) 연동
매 분마다 우리 다이어리 서버의 `/api/send-alarms` URL로 자동 신호를 보내 푸시 알림 발송 로직을 트리거하는 크론 잡을 개설합니다. (구글 클라우드 계정에 결제 정보가 등록되어 있어야 사용 가능합니다.)

1. **Google Cloud Console 접속**
   * 파이어베이스 프로젝트와 동일한 구글 계정으로 [Google Cloud Console](https://console.cloud.google.com/)에 접속합니다.
2. **프로젝트 선택**
   * 상단 프로젝트 선택 메뉴에서 파이어베이스 프로젝트 이름(`sosohomwork` 등)을 정확히 선택합니다.
3. **Cloud Scheduler 메뉴 이동**
   * 좌측 탐색 메뉴 검색창에 **"Cloud Scheduler"**를 검색하여 해당 메뉴로 이동합니다.
   * (만약 처음 사용하는 것이라면 API 사용 설정 버튼을 누르고 1분 정도 기다립니다.)
4. **작업(Job) 만들기**
   * 상단의 **[작업 만들기(Create Job)]**를 클릭합니다.
   * **이름**: `send-homework-alarms-cron`
   * **지역(Region)**: 호스팅 서버와 가까운 지역(예: `asia-northeast3` 또는 `us-central1`)을 선택합니다.
   * **빈도(Frequency)**: **`* * * * *`** (매 1분마다 호출하도록 설정하는 Unix 크론 포맷입니다.)
   * **시간대(Timezone)**: **한국 표준시(KST) - 대한민국 시간**을 선택합니다.
   * **[계속]**을 누릅니다.
5. **대상(Target) 설정**
   * **대상 유형**: **HTTP**로 지정합니다.
   * **URL**: 배포된 본인의 웹사이트 API 주소를 입력합니다.
     * 형식: `https://<YOUR_APP>.hosted.app/api/send-alarms`
   * **HTTP 메서드**: **GET**을 선택합니다.
   * **[계속]**을 누르고 하단의 **[만들기(Create)]** 버튼을 클릭해 작업을 생성합니다.

---

### 7-3. [선택 B] 무료 외부 크론 서비스 (cron-job.org) 연동
구글 클라우드 결제 등록이 번거롭거나 무료로 간편하게 사용하고 싶다면, 외부의 신뢰성 높은 무료 크론 스케줄링 서비스인 [cron-job.org](https://cron-job.org)를 이용할 수 있습니다.

1. **cron-job.org 회원가입 및 로그인**
   * [cron-job.org](https://cron-job.org/) 사이트에 접속하여 무료 회원가입 후 로그인합니다.
2. **새 크론 잡 생성**
   * 우측 상단 대시보드에서 **[Create Cronjob]** 버튼을 클릭합니다.
3. **크론 잡 상세 설정 입력**
   * **Title (제목)**: `Soso Homework Alarm` (임의의 식별명)
   * **URL**: 배포된 본인의 웹사이트 API 주소를 입력합니다.
     * 형식: `https://<YOUR_APP>.hosted.app/api/send-alarms`
   * **Request Method (HTTP 메서드)**: **GET**으로 유지합니다.
   * **Schedule (실행 주기)**:
     * **[User-defined]**을 선택하여 원하는 시간 단위를 설정하거나, **[Every 1 minute]** (매 1분마다)을 선택합니다.
     * (숙제 예정 시간에 딱 맞춰 푸시가 가야 하므로 `매 1분(Every 1 minute)` 설정을 권장합니다.)
4. **저장 및 연동 확인**
   * 하단의 **[Create]** 버튼을 눌러 작업을 저장합니다.
   * 대시보드 리스트에서 방금 만든 크론 잡 우측의 **[Details]** 또는 실행 이력을 통해, 상태 코드 `200`으로 내 웹 서버가 정상 호출되고 있는지 실시간 로그를 모니터링할 수 있습니다.

---

### 🎉 모든 설정 완료!
이제 지정한 스케줄러(구글 Cloud Scheduler 또는 cron-job.org)가 매 분마다 배포된 Next.js 서버 API를 호출하게 됩니다.
서버는 호출될 때마다 한국 시간을 기준으로 부모님이 미리 지정해 놓은 자녀별 완료 시간 대비 **'2시간 전', '1시간 전', '정시'**인 시점에 아직 완료되지 않은 오늘 숙제가 있다면 대상 기기들에게 알림을 발송합니다.
사용자가 브라우저에서 알림 허용을 누르면 해당 기기의 고유 토큰이 Firestore의 `devices` 컬렉션에 자동 보관되며, 이를 통해 실시간 푸시 알림을 정상적으로 수신할 수 있게 됩니다.
