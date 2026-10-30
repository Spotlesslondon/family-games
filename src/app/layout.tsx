import type { Metadata, Viewport } from "next";
import "./globals.css";
import { RegisterServiceWorker } from "./register-sw";

export const metadata: Metadata = {
  title: "Family Games",
  description: "Game night on everyone's phone",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Family Games",
  },
};

export const viewport: Viewport = {
  themeColor: "#1f2937",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col font-sans">
        {children}
        <RegisterServiceWorker />
      </body>
    </html>
  );
}
