import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PromptCraft Image",
  description: "Structured AI image generation for polished commercial visuals.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
