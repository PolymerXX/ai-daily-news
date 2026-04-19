import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ToastProvider } from "@/components/layout/toast-provider";
import MobileNav from "@/components/layout/mobile-nav";
import ChatWidget from "@/components/chat/chat-widget";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "每日AI资讯 - AI Daily News",
  description: "汇聚全球AI领域最新资讯，包括大模型、芯片、政策、应用和开源等多个维度的深度报道。",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="zh-CN"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased dark`}
    >
      <body className="min-h-full flex flex-col">
        <ToastProvider>
          {children}
          <MobileNav />
          <ChatWidget />
        </ToastProvider>
      </body>
    </html>
  );
}
