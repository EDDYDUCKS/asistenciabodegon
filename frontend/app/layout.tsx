import type { Metadata } from "next";
import { bigShoulders, inter } from "./font";
import BackendKeepAlive from "@/components/BackendKeepAlive";
import "./globals.css";

export const metadata: Metadata = {
  title: "BodegónPass | Sistema de Asistencia",
  description: "BodegónPass — Sistema Inteligente de Control de Asistencia y Personal",
  robots: { index: false, follow: false },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="es"
      className={`${bigShoulders.variable} ${inter.variable} h-full antialiased`}
    >
      <head>
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#135E4A" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <link rel="icon" href="/icon.png" type="image/png" />
        <link rel="apple-touch-icon" href="/icon.png" />
      </head>
      <body className="min-h-full flex flex-col font-sans bg-crema text-tinta">
        <BackendKeepAlive />
        {children}
      </body>
    </html>
  );
}
