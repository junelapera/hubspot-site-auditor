import type { NextConfig } from "next";

// Cache Components is off: every page is per-user live data from Supabase, so
// there's no static shell worth prerendering.
const nextConfig: NextConfig = {
  turbopack: {
    rules: {
      "*.css": {
        // Our CSS only: next/font's generated stylesheets break if Tailwind processes them.
        condition: { not: "foreign" },
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
