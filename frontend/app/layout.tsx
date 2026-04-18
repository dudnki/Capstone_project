import type { Metadata } from 'next';
import { Noto_Sans_KR, DM_Mono } from 'next/font/google';
import './globals.css';

const notoSansKr = Noto_Sans_KR({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
});

const dmMono = DM_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-dm-mono',
});

export const metadata: Metadata = {
  title: 'Pipeline Architect — RAG 평가 플랫폼',
  description: '문서 업로드, 질문 세트 생성, 결과 제출 기반의 RAG 평가 플랫폼',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body className={`${notoSansKr.className} ${dmMono.variable} antialiased`}>
        {children}
      </body>
    </html>
  );
}