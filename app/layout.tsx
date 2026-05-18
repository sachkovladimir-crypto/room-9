import type { Metadata } from "next";
import { AudioPlayerProvider } from "@/components/GlobalAudioPlayer";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import "./globals.css";

export const metadata: Metadata = {
  title: "ROOM_9",
  description: "Dark brutalist DJ booking platform for underground electronic artists."
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning>
        <AudioPlayerProvider>
          <SiteHeader />
          {children}
          <SiteFooter />
        </AudioPlayerProvider>
      </body>
    </html>
  );
}
