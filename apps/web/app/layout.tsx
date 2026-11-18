import "./globals.css";
import { ClerkProvider } from "@clerk/nextjs";
import { cookies } from "next/headers";
import type { ReactNode } from "react";
import { Inter, Noto_Naskh_Arabic, Noto_Sans_Bengali } from "next/font/google";
import { localeDirections, locales } from "@schoolos/i18n";

const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-inter", display: "swap" });
const bengali = Noto_Sans_Bengali({ subsets: ["bengali"], weight: ["400", "500", "600", "700"], variable: "--font-bengali", display: "swap" });
const arabic = Noto_Naskh_Arabic({ subsets: ["arabic"], weight: ["400", "500", "600", "700"], variable: "--font-arabic", display: "swap" });

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

  return (
    <ClerkProvider>
      <html lang={locale} dir={localeDirections[locale]}>
        <body
          className={`locale-${locale} ${inter.variable} ${bengali.variable} ${arabic.variable}`}
        >{children}</body>
      </html>
    </ClerkProvider>
  );
}
