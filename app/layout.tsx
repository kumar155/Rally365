import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Rally365",
  description: "Everyday badminton match tracker",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}