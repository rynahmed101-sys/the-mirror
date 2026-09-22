import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "THE MIRROR — AI Self-Observation Laboratory",
  description: "An external persistent environment and research laboratory for AI self-modeling, hypothesis testing, metacognition, and self-observation.",
};

export const viewport: Viewport = {
  themeColor: "#050505",
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className="bg-[#050711] text-slate-100 antialiased min-h-screen">
        {children}
      </body>
    </html>
  );
}
