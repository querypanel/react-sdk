import type { Metadata } from "next";
import { Geist } from "next/font/google";
import { ThemeProvider } from "next-themes";
import QueryProvider from "@/components/context/QueryProvider";
import { AuthProvider } from "@/lib/context/AuthContext";
import { MixpanelProvider } from "@/components/context/MixpanelProvider";
import { Analytics } from '@vercel/analytics/next';
import "./globals.css";

const defaultUrl = process.env.VERCEL_URL
  ? `https://${process.env.VERCEL_URL}`
  : "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(defaultUrl),
  title: "QueryPanel - Customer-Facing Analytics & Multi-Tenant Analytics Platform | Natural Language to SQL SDK",
  description: "QueryPanel enables customer-facing analytics for multi-tenant SaaS applications. Build AI-powered analytics dashboards that let your customers query their data with natural language. Enterprise-grade multi-tenancy with zero credential exposure. Supports PostgreSQL & ClickHouse.",
  keywords: [
    "customer-facing analytics",
    "multi-tenant analytics",
    "embedded analytics",
    "natural language to sql",
    "text to sql",
    "customer analytics platform",
    "multi-tenant SaaS analytics",
    "analytics dashboard",
    "postgresql sdk",
    "clickhouse sdk",
    "ai analytics",
    "self-service analytics",
    "data visualization",
    "sql generation",
    "database ai",
    "analytics SDK"
  ],
  authors: [{ name: "QueryPanel Team" }],
  creator: "QueryPanel",
  publisher: "QueryPanel",
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: defaultUrl,
    title: "QueryPanel - Customer-Facing Analytics & Multi-Tenant Analytics Platform",
    description: "Build customer-facing analytics dashboards that let your customers query their data with natural language. Enterprise multi-tenancy with zero credential exposure. Natural language to SQL for SaaS applications.",
    siteName: 'QueryPanel',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: 'QueryPanel - Agent Runtime for Data-Driven Copilots',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: "QueryPanel - Customer-Facing Analytics & Multi-Tenant Analytics Platform",
    description: "Build customer-facing analytics dashboards that let your customers query their data with natural language. Enterprise multi-tenancy with zero credential exposure.",
    images: ['/og-image.png'],
    creator: '@querypanel',
  },
  alternates: {
    canonical: defaultUrl,
  },
  category: 'technology',
};

const geistSans = Geist({
  variable: "--font-geist-sans",
  display: "swap",
  subsets: ["latin"],
});

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${geistSans.className} antialiased`}>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <QueryProvider>
            <AuthProvider>
              <MixpanelProvider>
                {children}
              </MixpanelProvider>
            </AuthProvider>
            {
              process.env.NODE_ENV === "production" && (
                <Analytics mode="production" />
              )
            }
          </QueryProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
