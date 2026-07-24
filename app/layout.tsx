import type { Metadata } from "next";
import { cookies, headers } from "next/headers";
import { Fraunces, IBM_Plex_Mono, Inter } from "next/font/google";
import { I18nProvider } from "@/components/i18n-provider";
import { normalizeLang } from "@/lib/i18n";
import "./globals.css";

const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  style: ["normal", "italic"],
});
const inter = Inter({ variable: "--font-sans", subsets: ["latin"] });
const plexMono = IBM_Plex_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["500"],
});

export const metadata: Metadata = {
  title: "Chekkam - One check. Total trust.",
  description: "Verify messages, documents, and safety alerts across Cameroon.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const cookieStore = await cookies();
  const headerStore = await headers();
  const lang = normalizeLang(
    cookieStore.get("chekkam_lang")?.value ?? headerStore.get("accept-language")
  );

  return (
    <html
      lang={lang}
      className={`${fraunces.variable} ${inter.variable} ${plexMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <I18nProvider initialLang={lang}>{children}</I18nProvider>
      </body>
    </html>
  );
}
