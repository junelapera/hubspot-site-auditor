import type { Metadata } from "next";
import { Fraunces, Hanken_Grotesk, JetBrains_Mono } from "next/font/google";
import Image from "next/image";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import "./globals.css";

const hanken = Hanken_Grotesk({ variable: "--font-hanken", subsets: ["latin"] });
const fraunces = Fraunces({ variable: "--font-fraunces", subsets: ["latin"], weight: ["500", "600"] });
const jetbrains = JetBrains_Mono({ variable: "--font-jetbrains", subsets: ["latin"], weight: ["500", "700"] });

export const metadata: Metadata = {
  title: "HubSpot Site Auditor",
  description: "Accessibility and security issues grouped by HubSpot module.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${hanken.variable} ${fraunces.variable} ${jetbrains.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col font-sans">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-full focus:border-2 focus:border-ink focus:bg-yellow focus:px-4 focus:py-2 focus:font-mono focus:text-xs focus:font-bold focus:uppercase"
        >
          Skip to content
        </a>
        <Header />
        <div id="main" className="flex flex-1 flex-col">
          {children}
        </div>
        <footer className="bg-ink text-cream">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-5 font-mono text-[11px] font-bold tracking-[0.08em] uppercase">
            <span>Salted Stone · HubSpot Site Auditor</span>
            <span className="text-cream/80">Automated, passive scans — not a full audit</span>
          </div>
        </footer>
      </body>
    </html>
  );
}

async function Header() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return null;

  return (
    <header className="border-b border-ink bg-cream">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
        <nav aria-label="Main" className="flex items-center gap-6">
          <Link href="/" className="flex items-center gap-3 rounded focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ink">
            <Image src="/brand/saltedstone.svg" alt="Salted Stone" width={110} height={32} priority />
            <span className="hidden border-l border-ink pl-3 font-mono text-[11px] font-bold tracking-[0.08em] uppercase sm:inline">
              Site Auditor
            </span>
          </Link>
          <Link href="/" className="font-mono text-xs font-bold tracking-[0.08em] uppercase hover:underline hover:underline-offset-4">
            Sites
          </Link>
          <Link href="/team" className="font-mono text-xs font-bold tracking-[0.08em] uppercase hover:underline hover:underline-offset-4">
            Team
          </Link>
        </nav>
        <div className="flex items-center gap-3">
          <span className="hidden text-sm text-ink/75 md:inline">{data.user.email}</span>
          <form action="/auth/signout" method="post">
            <button type="submit" className="btn btn-secondary btn-sm">
              Sign out
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
