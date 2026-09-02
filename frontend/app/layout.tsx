import type { Metadata } from "next";
import { outfit, inter } from "./font";
import "./globals.css";

export const metadata: Metadata = {
  title: "BodegónPass | Sistema de Asistencia",
  description: "BodegónPass — Sistema Inteligente de Control de Asistencia y Personal",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="es"
      className={`${outfit.variable} ${inter.variable} h-full antialiased`}
    >
      <head>
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#1c6856" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <link rel="apple-touch-icon" href="/icon.png" />
      </head>
      <body className="min-h-full flex flex-col font-sans bg-[#fcf9f5] text-[#1c1917]">{children}</body>
    </html>
  );
}
