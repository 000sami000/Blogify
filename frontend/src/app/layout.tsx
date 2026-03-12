import type { Metadata } from "next";
import "./globals.css";
import Navbar from "@/components/navbar";
import { AppProvider } from "@/context/AppContext";
import ErrorBanner from "@/components/error-banner";
import SiteFooter from "@/components/site-footer";
import { Plus_Jakarta_Sans, Sora } from "next/font/google";

const displayFont = Sora({
  subsets: ["latin"],
  variable: "--font-display",
});

const bodyFont = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-body",
});

export const metadata: Metadata = {
  title: "The Reading Retreat",
  description: "Modern blogging microservices app",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${displayFont.variable} ${bodyFont.variable}`}>
        <AppProvider>
          <div className="site-shell min-h-screen">
            <div className="site-glow site-glow-1" />
            <div className="site-glow site-glow-2" />
            <Navbar />
            <ErrorBanner />
            <main className="relative z-10 mx-auto w-full max-w-[1600px] px-3 pb-8 sm:px-6 lg:px-8">
              {children}
            </main>
            <SiteFooter />
          </div>
        </AppProvider>
      </body>
    </html>
  );
}
