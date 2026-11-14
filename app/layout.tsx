import type { Metadata } from "next";
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/inter/700.css";
import "./globals.css";
export const metadata: Metadata = {
  title: "Cyber Writing — KSM Cyber Security",
  description:
    "Ruang menulis, berbagi wawasan, dan membangun kesadaran keamanan digital. KSM Cyber Security UPN Veteran Jakarta.",
  robots: { index: false, follow: false },
  icons: { icon: "/cyber-logo.png" },
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id">
      <body>{children}</body>
    </html>
  );
}
