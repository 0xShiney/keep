import type { Metadata } from "next";
import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import type { ReactNode } from "react";
import { Providers } from "@/components/providers";
import { getThemePref } from "@/lib/theme";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Keep", template: "%s · Keep" },
  description: "A private, self-hosted code forge for one owner-operator.",
  robots: { index: false, follow: false },
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  // Reading the cookie makes the shell dynamic, which the per-request CSP nonce
  // requires anyway. It also guarantees the theme is correct before first paint.
  const theme = await getThemePref();

  return (
    <html
      lang="en"
      data-theme={theme}
      className={`${GeistSans.variable} ${GeistMono.variable}`}
      suppressHydrationWarning
    >
      <body className="bg-bg text-fg min-h-dvh antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
