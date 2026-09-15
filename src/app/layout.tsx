import type { Metadata } from "next";
import { Noto_Sans_KR, Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { LoaderProvider } from "@/lib/loader";
import LoadingOverlay from "./Loading";
import NavigationLoader from "@/components/NavigationLoader";

const notoSans = Noto_Sans_KR({
  variable: "--font-noto-sans-kr",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Work-Signal — 기업 인력 흐름 확인",
  description:
    "Work-Signal은 공공데이터에 담긴 기업의 인력 현황과 이동을 취업·이직 준비생이 이해하기 쉽게 정리하는 서비스입니다.",
  icons: {
    icon: "/favicon.ico",
  },
};

export default function RootLayout({
  children,
}: LayoutProps<"/">) {
  return (
    <html
      lang="ko"
      className={`${notoSans.variable} ${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <LoaderProvider>
                  {children}
                  <LoadingOverlay />
                  <NavigationLoader />
                </LoaderProvider>
      </body>
    </html>
  );
}
