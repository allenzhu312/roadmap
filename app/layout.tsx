import type { Metadata } from "next";
import { headers } from "next/headers";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export async function generateMetadata(): Promise<Metadata> {
  const incoming = await headers();
  const host = incoming.get("x-forwarded-host") ?? incoming.get("host") ?? "localhost:3000";
  const protocol = incoming.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const base = new URL(`${protocol}://${host}`);
  const socialImage = new URL("/og.png", base).toString();

  return {
    metadataBase: base,
    title: "Roadmap Studio｜交互式计划时间表",
    description: "自由添加、调整和保存任务的可视化路线图。",
    openGraph: {
      title: "Roadmap Studio",
      description: "自由创建、调整和保存任务的交互式 Roadmap。",
      type: "website",
      images: [{ url: socialImage, width: 1735, height: 907, alt: "Roadmap Studio 交互式计划时间表" }],
    },
    twitter: {
      card: "summary_large_image",
      title: "Roadmap Studio",
      description: "自由创建、调整和保存任务的交互式 Roadmap。",
      images: [socialImage],
    },
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body className={`${geistSans.variable} ${geistMono.variable}`}>{children}</body>
    </html>
  );
}
