import { headers } from "next/headers";
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Spall Spill — Your world, easy to find", template: "%s | Spall Spill" },
  description: "An expressive Identity for you and a structured Spill for the Products and Resources you share.",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // Nonce-based CSP requires request-time rendering, including the marketing root.
  await headers();
  return (
    <html lang="en">
      <body><a className="skip-link" href="#main-content">Skip to content</a>{children}</body>
    </html>
  );
}
