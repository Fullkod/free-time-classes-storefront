import type { Metadata, Viewport } from "next";
import { Geist, Instrument_Serif, Plus_Jakarta_Sans } from "next/font/google";
import "@/app/[locale]/globals.css";
import { getMetadataBase } from "@/lib/seo/page-metadata";

const plusJakartaSans = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-plus-jakarta",
  display: "swap",
});

const geist = Geist({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-geist",
  display: "swap",
});

const instrumentSerif = Instrument_Serif({
  subsets: ["latin"],
  weight: ["400"],
  style: ["normal", "italic"],
  variable: "--font-instrument-serif",
  display: "swap",
});

const metadataBase = getMetadataBase();

export const metadata: Metadata = {
  ...(metadataBase ? { metadataBase } : {}),
  title: {
    default: "Free Time Classes",
    template: "%s · Free Time Classes",
  },
  description: "Find and book classes for your free time",
  icons: {
    icon: "/favicon.ico",
    shortcut: "/favicon.ico",
  },
};

// viewport-fit=cover makes env(safe-area-inset-*) non-zero on iOS (notch,
// home indicator), which the bottom nav and full-height screens rely on.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es" suppressHydrationWarning>
      {/* data-theme on <body> so portaled dialogs, menus and toasts get the
          FreeTime tokens too (F065); the CSS only defines --ft-* variables. */}
      <body
        data-theme="freetime"
        className={`${plusJakartaSans.variable} ${geist.variable} ${instrumentSerif.variable} font-sans antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
