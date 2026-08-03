import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TradingNote · Trading Research System",
  description: "比較個人與 Mamba FX 的交易決策，將重複錯誤轉化為可驗證規則。",
  openGraph: {
    title: "Trading Research System",
    description: "Turn decision gaps into verified rules",
    images: ["/og.png"],
  },
  twitter: {
    card: "summary_large_image",
    title: "Trading Research System",
    description: "Turn decision gaps into verified rules",
    images: ["/og.png"],
  },
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
