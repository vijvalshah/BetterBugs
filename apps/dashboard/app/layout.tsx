import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "BetterBugs Dashboard",
  description: "Capture context. Debug faster.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.variable} font-sans antialiased min-h-screen bg-background text-foreground`}>
        <header className="border-b border-border px-6 py-3 flex items-center justify-between sticky top-0 z-50 bg-background/80 backdrop-blur-sm">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-primary-foreground">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            </div>
            <span className="font-semibold text-lg tracking-tight">BetterBugs</span>
          </div>
          <nav className="flex items-center gap-4 text-sm text-muted-foreground">
            <span>Sessions</span>
            <span>Settings</span>
          </nav>
        </header>
        <main className="max-w-[1400px] mx-auto px-6 py-8">
          {children}
        </main>
      </body>
    </html>
  );
}
