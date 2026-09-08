import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "คิดต้นทุนเมนู",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="th">
      <body>{children}</body>
    </html>
  );
}
