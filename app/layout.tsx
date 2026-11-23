import type { Metadata } from "next";
import { Noto_Sans_SC, Noto_Serif_SC } from "next/font/google";
import "./globals.css";

const displayFont = Noto_Serif_SC({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-display",
  display: "swap",
});

const bodyFont = Noto_Sans_SC({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-body",
  display: "swap",
});

export const metadata: Metadata = {
  title: "PixGen · 浅色调油画美学 AI 视觉工作室",
  description: "以浅色调油画画廊语言构建的 AI 商业视觉与商品图创作工作台，支持经典可视化参数与 Agent 多轮对话改图。",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body className={`${displayFont.variable} ${bodyFont.variable} oil-linen-surface antialiased`}>
        {children}
      </body>
    </html>
  );
}
