import "./globals.css";
import { ClerkProvider } from "@clerk/nextjs";
import { cookies } from "next/headers";
import type { ReactNode } from "react";
import { localeDirections, locales } from "@schoolos/i18n";

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
        <body className={`locale-${locale}`}>{children}</body>
      </html>
    </ClerkProvider>
  );
}
