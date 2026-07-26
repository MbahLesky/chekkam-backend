import type { Metadata } from "next";
import { cookies, headers } from "next/headers";
import { IBM_Plex_Mono, Plus_Jakarta_Sans, Sora } from "next/font/google";
import { I18nProvider } from "@/components/i18n-provider";
import { normalizeLang } from "@/lib/i18n";
import "./globals.css";

// Brand Guide v4 §4.1: Sora carries the logo wordmark and headings, Plus
// Jakarta Sans carries body/UI text (it has the stronger French diacritic
// coverage), IBM Plex Mono carries codes and IDs. Sora has no italic, so
// unlike v3's Fraunces it declares only the normal style.
const sora = Sora({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["400", "600", "700"],
});
const jakarta = Plus_Jakarta_Sans({
  variable: "--font-sans",
  subsets: ["latin"],
});
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
      className={`${sora.variable} ${jakarta.variable} ${plexMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <I18nProvider initialLang={lang}>{children}</I18nProvider>
      </body>
    </html>
  );
}
