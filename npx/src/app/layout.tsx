import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "🏡 소소한 가족의 📝 숙제 다이어리",
  description: "소윤이와 소민이의 숙제 스케줄을 아기자기하게 관리하는 가족 다이어리",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <head>
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          href="https://fonts.googleapis.com/css2?family=Fredoka:wght@300..700&family=Jua&family=Gamja+Flower&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        {children}
      </body>
    </html>
  );
}
