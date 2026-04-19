import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Video Agent",
  description: "AI-powered video Q&A",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" className="dark">
      <body className="min-h-screen bg-[var(--bg)] text-[var(--text)] antialiased">
        {children}
      </body>
    </html>
  );
}
