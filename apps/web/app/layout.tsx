import "./tokens.css";
import "./globals.css";
import "./admin/admin.css";
import "./tailwind.css";
import { ClerkProvider } from "@clerk/nextjs";
import { cookies } from "next/headers";
import type { ReactNode } from "react";
import type { Viewport } from "next";
import { Inter, Noto_Naskh_Arabic, Noto_Sans_Bengali } from "next/font/google";
import { localeDirections, locales } from "@schoolos/i18n";

const inter = Inter({ subsets: ["latin"], weight: ["400", "600", "700"], variable: "--font-inter", display: "swap" });
const bengali = Noto_Sans_Bengali({ subsets: ["bengali"], weight: ["400", "600"], variable: "--font-bengali", display: "swap", preload: false });
const arabic = Noto_Naskh_Arabic({ subsets: ["arabic"], weight: ["400", "600"], variable: "--font-arabic", display: "swap", preload: false });

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f5f7fb" },
    { media: "(prefers-color-scheme: dark)", color: "#0b1220" },
  ],
};

export const metadata = {
  title: {
    default: "SchoolOS Admin",
    template: "%s | SchoolOS Admin",
  },
  description: "School operations management portal",
};

export default async function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  const requestedLocale = (await cookies()).get("schoolos-locale")?.value;
  const locale =
    requestedLocale &&
    Object.prototype.hasOwnProperty.call(locales, requestedLocale)
      ? (requestedLocale as keyof typeof locales)
      : "en";

  const themeCookie = (await cookies()).get("schoolos-theme")?.value;
  const theme = themeCookie === "light" || themeCookie === "dark" ? themeCookie : undefined;

  return (
    <ClerkProvider>
      <html lang={locale} dir={localeDirections[locale]} data-theme={theme}>
        <body
          className={`locale-${locale} ${inter.variable} ${bengali.variable} ${arabic.variable}`}
        >{children}</body>
      </html>
    </ClerkProvider>
  );
}
