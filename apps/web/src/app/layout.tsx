import type { Metadata } from "next";
import type { ReactNode } from "react";

import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Spall Spill",
    template: "%s · Spall Spill",
  },
  description: "Spall Spill — creator-centric product and resource discovery.",
  applicationName: "Spall Spill",
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_ORIGIN ?? "http://localhost:3000"),
  robots: {
    index: process.env.VERCEL_ENV === "production",
    follow: process.env.VERCEL_ENV === "production",
  },
};

type RootLayoutProps = Readonly<{
  children: ReactNode;
}>;

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="id">
      <body>{children}</body>
    </html>
  );
}
