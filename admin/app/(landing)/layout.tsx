import type { Metadata } from "next";
import { Inter } from "next/font/google";
import GetswanTracker from "./GetswanTracker";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-sans",
});

const siteUrl = "https://querypanel.io";

export const metadata: Metadata = {
  title:
    "QueryPanel | Embedded Analytics for SaaS (AI SQL + Dashboards)",
  description:
    "Embed customer-facing analytics in your SaaS with AI-generated SQL, tenant-safe queries, and production-ready dashboards.",
  alternates: {
    canonical: siteUrl,
  },
  openGraph: {
    url: siteUrl,
    title: "QueryPanel | Embedded Analytics for SaaS",
    description:
      "Ship customer-facing analytics faster with AI SQL generation, multi-tenant isolation, and embedded dashboards.",
    siteName: "QueryPanel",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "QueryPanel embedded analytics platform",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "QueryPanel | Embedded Analytics for SaaS",
    description:
      "AI SQL generation + tenant-safe embedded dashboards for B2B SaaS teams.",
    images: ["/og-image.png"],
  },
};

const faqEntities = [
  {
    "@type": "Question",
    name: "What is QueryPanel?",
    acceptedAnswer: {
      "@type": "Answer",
      text: "QueryPanel is an embedded analytics platform for B2B SaaS products. It turns natural language questions into SQL, charts, and dashboards while keeping customer data in your infrastructure.",
    },
  },
  {
    "@type": "Question",
    name: "How does QueryPanel handle multi-tenant data?",
    acceptedAnswer: {
      "@type": "Answer",
      text: "QueryPanel supports tenant-scoped query generation. You provide tenant context and tenant field configuration, and generated SQL is scoped to the correct tenant.",
    },
  },
  {
    "@type": "Question",
    name: "What databases does QueryPanel support?",
    acceptedAnswer: {
      "@type": "Answer",
      text: "QueryPanel supports PostgreSQL, ClickHouse, BigQuery, and MySQL.",
    },
  },
  {
    "@type": "Question",
    name: "How is QueryPanel different from generic BI tools?",
    acceptedAnswer: {
      "@type": "Answer",
      text: "QueryPanel is purpose-built for customer-facing SaaS analytics. It is developer-first, multi-tenant aware, and designed to embed analytics directly inside your product.",
    },
  },
];

const structuredData = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "SoftwareApplication",
      "name": "QueryPanel",
      "description": "QueryPanel enables customer-facing analytics for multi-tenant SaaS applications. Build AI-powered analytics dashboards that let your customers query their data with natural language. Enterprise-grade multi-tenancy with zero credential exposure. Supports PostgreSQL, ClickHouse, BigQuery, and MySQL.",
      "url": siteUrl,
      "applicationCategory": "BusinessApplication",
      "operatingSystem": "Any",
      "offers": {
        "@type": "Offer",
        "price": "1500",
        "priceCurrency": "USD",
        "priceSpecification": {
          "@type": "UnitPriceSpecification",
          "price": "1500",
          "priceCurrency": "USD",
          "unitText": "MONTH"
        }
      },
      "creator": {
        "@type": "Organization",
        "name": "QueryPanel"
      },
      "featureList": [
        "Embedded analytics platform for SaaS",
        "Multi-tenant data isolation",
        "Natural language to SQL conversion",
        "Self-service customer analytics dashboards",
        "PostgreSQL, ClickHouse, BigQuery, and MySQL support",
        "Zero credential exposure",
        "Chart and dashboard generation",
        "Schema auto-discovery",
        "Enterprise-grade security",
        "Tenant-aware query generation"
      ]
    },
    {
      "@type": "FAQPage",
      "mainEntity": faqEntities
    },
    {
      "@type": "Organization",
      "name": "QueryPanel",
      "url": siteUrl,
      "logo": `${siteUrl}/favicon.svg`,
      "sameAs": [
        "https://github.com/querypanel",
        "https://www.npmjs.com/package/@querypanel/node-sdk"
      ]
    }
  ]
};

export default function LandingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const structuredDataJson = JSON.stringify(structuredData);

  return (
    <div className={`${inter.variable} font-sans`}>
      <GetswanTracker />
      <script type="application/ld+json">{structuredDataJson}</script>
      {children}
    </div>
  );
}