import type { Metadata, Viewport } from "next";
import { fredoka as display, nunito as body } from "@/fonts";
import "./globals.css";
import { RegisterServiceWorker } from "./register-sw";

export const metadata: Metadata = {
  title: "Asher Games",
  description: "Game night on everyone's phone",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Asher Games",
  },
};

export const viewport: Viewport = {
  themeColor: "#12162B",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`h-full antialiased ${display.variable} ${body.variable}`}>
      <body className="min-h-full flex flex-col font-sans bg-ground text-ink">
        {children}
        <RegisterServiceWorker />
      </body>
    </html>
  );
}
