import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "اتو ال‌ام | پلاگین گزارش خودرو",
  description: "از توضیحات وضعیت خودرو تا گزارش کارشناسی فارسی در ChatGPT",
  icons: {
    icon: "/assets/auto-ml-logo.png",
    shortcut: "/assets/auto-ml-logo.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fa" dir="rtl">
      <body className="antialiased">{children}</body>
    </html>
  );
}
