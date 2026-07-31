import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TradingNote｜交易績效儀表板",
  description: "中文交易日誌、FTMO 風控分析與交易報酬模擬工具。",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-Hant">
      <body>{children}</body>
    </html>
  );
}
