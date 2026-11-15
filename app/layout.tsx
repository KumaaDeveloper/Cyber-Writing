import type { Metadata } from "next";
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/inter/700.css";
import "./globals.css";
export const metadata: Metadata = {
  title: "CYWRITE — KSM Cyber Security",
  description:
    "Ruang menulis, berbagi wawasan, dan membangun kesadaran keamanan digital. KSM Cyber Security UPN Veteran Jakarta.",
  robots: { index: false, follow: false },
  icons: {
    icon: [{ url: "/favicon-v2.png", type: "image/png" }],
    shortcut: "/favicon.ico",
  },
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id">
      <body>{children}</body>
    </html>
  );
}
