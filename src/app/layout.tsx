import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "fye — P0 loop",
  description: "Personal balance sheet, PayPal sync, iMessage ingest, purchase agent",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
