"use client";

import React from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowLeftIcon } from "lucide-react";

export default function PrivacyPolicyPage() {
  return (
    <main className="min-h-screen bg-background">
      <div className="container max-w-4xl mx-auto px-4 py-12">
        <Link href="/">
          <Button variant="ghost" className="mb-8">
            <ArrowLeftIcon className="w-4 h-4 mr-2" />
            Back to Home
          </Button>
        </Link>

        <h1 className="text-4xl font-bold mb-2">Privacy Policy</h1>
        <p className="text-muted-foreground mb-8">Last updated: December 2025</p>

        <div className="prose prose-gray dark:prose-invert max-w-none space-y-6">
          <section>
            <h2 className="text-2xl font-semibold mt-8 mb-4">1. Introduction</h2>
            <p className="text-muted-foreground leading-relaxed">
              QueryPanel (&quot;we&quot;, &quot;our&quot;, or &quot;us&quot;) is committed to protecting your privacy. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our service.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mt-8 mb-4">2. Information We Collect</h2>
            <h3 className="text-xl font-medium mt-6 mb-3">Account Information</h3>
            <p className="text-muted-foreground leading-relaxed">
              When you create an account, we collect your email address, name, and organization details.
            </p>
            <h3 className="text-xl font-medium mt-6 mb-3">Schema Metadata</h3>
            <p className="text-muted-foreground leading-relaxed">
              We store database schema metadata (table names, column names, data types) to generate SQL queries. We do NOT store your actual data or database credentials.
            </p>
            <h3 className="text-xl font-medium mt-6 mb-3">Usage Data</h3>
            <p className="text-muted-foreground leading-relaxed">
              We collect information about how you interact with our service, including queries made, features used, and performance metrics.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mt-8 mb-4">3. How We Use Your Information</h2>
            <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
              <li>To provide and maintain our service</li>
              <li>To generate accurate SQL queries based on your schema</li>
              <li>To improve and personalize your experience</li>
              <li>To communicate with you about updates and support</li>
              <li>To detect and prevent fraud or abuse</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mt-8 mb-4">4. Data Security</h2>
            <p className="text-muted-foreground leading-relaxed">
              We implement industry-standard security measures to protect your information. Your database credentials are never stored on our servers—all query execution happens in your infrastructure.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mt-8 mb-4">5. Data Retention</h2>
            <p className="text-muted-foreground leading-relaxed">
              We retain your account information and schema metadata for as long as your account is active. You can request deletion of your data at any time by contacting us.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mt-8 mb-4">6. Your Rights</h2>
            <p className="text-muted-foreground leading-relaxed">
              You have the right to access, correct, or delete your personal information. You may also request a copy of your data or restrict its processing. Contact us at privacy@querypanel.io to exercise these rights.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mt-8 mb-4">7. Contact Us</h2>
            <p className="text-muted-foreground leading-relaxed">
              If you have questions about this Privacy Policy, please contact us at:
            </p>
            <p className="text-muted-foreground mt-2">
              Email: privacy@querypanel.io<br />
              QueryPanel<br />
              Budapest, Hungary
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}
