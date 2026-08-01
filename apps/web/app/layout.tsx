import type { Metadata } from "next";
import { Fraunces, Inter, JetBrains_Mono } from "next/font/google";

import "./globals.css";
import { ThemeToggle } from "@/components/theme-toggle";
import { SiteHeader } from "@/components/site-header";

// Self-hosted at build time by next/font — no runtime request to Google, no layout shift.
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});
const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
  display: "swap",
  axes: ["opsz"],
});
const mono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono-jetbrains",
  display: "swap",
});

export const metadata: Metadata = {
  title: "pay-agent — gift-card-funded payments",
  description:
    "A storefront and wallet for an agent that pays from gift cards. One funding core, many destinations.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // The font variables must live on <html>, not <body>. `--font-serif` and friends are
    // declared on `:root`, and a custom property substitutes at the element where it is
    // *declared* — so a `var(--font-fraunces)` that only exists on <body> is invalid at
    // `:root` and inherits down as invalid, silently falling back to Times New Roman.
    <html
      lang="en"
      suppressHydrationWarning
      className={`${inter.variable} ${fraunces.variable} ${mono.variable}`}
    >
      <head>
        {/* Set the theme before first paint so there is no flash of the wrong one. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('pa-theme');if(t)document.documentElement.setAttribute('data-theme',t);}catch(e){}})();`,
          }}
        />
      </head>
      <body>
        <SiteHeader themeToggle={<ThemeToggle />} />
        <main>{children}</main>
      </body>
    </html>
  );
}
