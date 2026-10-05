import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "THE MIRROR — Math & Physics Science Lab",
  description: "A controlled laboratory for testing mathematical and physical theories, models, formulas, and experimental code.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-[#050608] text-slate-100 antialiased">{children}</body>
    </html>
  );
}
