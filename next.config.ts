import bundleAnalyzer from "@next/bundle-analyzer";
import { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/config.ts");

const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === "true",
});

/** @type {import('next').NextConfig} */
const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // G-prod-6: the app is never meant to be framed by another site.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
  experimental: {
    optimizePackageImports: [
      "lucide-react",
      "@radix-ui/react-avatar",
      "@radix-ui/react-dialog",
      "@radix-ui/react-dropdown-menu",
      "@radix-ui/react-label",
      "@radix-ui/react-radio-group",
      "@radix-ui/react-slot",
      "@radix-ui/react-tabs",
      "@radix-ui/react-tooltip",
    ],
  },
  images: {
    unoptimized: false,
    formats: ["image/avif", "image/webp"],
    remotePatterns: [
      {
        protocol: "https" as const,
        hostname: "lh3.googleusercontent.com",
      },
      {
        protocol: "https" as const,
        hostname: "*.supabase.co",
      },
    ],
  },
};

export default withBundleAnalyzer(withNextIntl(nextConfig));
