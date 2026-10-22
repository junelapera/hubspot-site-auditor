import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "HubSpot Site Auditor",
  description: "Accessibility and security issues grouped by HubSpot module.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col font-sans">
        <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded focus:bg-white focus:px-3 focus:py-2 focus:shadow">
          Skip to content
        </a>
        <Header />
        <div id="main" className="flex flex-1 flex-col">
          {children}
        </div>
      </body>
    </html>
  );
}

async function Header() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return null;

  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
        <Link href="/" className="text-sm font-semibold text-slate-900 hover:text-slate-600">
          HubSpot Site Auditor
        </Link>
        <div className="flex items-center gap-3 text-sm text-slate-600">
          <span className="hidden sm:inline">{data.user.email}</span>
          <form action="/auth/signout" method="post">
            <button type="submit" className="rounded px-2 py-1 text-slate-700 hover:bg-slate-100 hover:text-slate-900">
              Sign out
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
