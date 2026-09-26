import type { Metadata } from "next";
import "./globals.css";
import "./loading-splash.css";
import TournamentNavBridge from "./tournament-nav-bridge";

export const metadata: Metadata = {
  title: "Rally365",
  description: "Everyday badminton match tracker",
  applicationName: "Rally365",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "Rally365" },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        {children}
        <TournamentNavBridge />
      </body>
    </html>
  );
}
