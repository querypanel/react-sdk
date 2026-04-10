"use client";

import React from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowLeftIcon } from "lucide-react";

export default function TermsOfServicePage() {
  return (
    <main className="min-h-screen bg-background">
      <div className="container max-w-4xl mx-auto px-4 py-12">
        <Link href="/">
          <Button variant="ghost" className="mb-8">
            <ArrowLeftIcon className="w-4 h-4 mr-2" />
            Back to Home
          </Button>
        </Link>

        <h1 className="text-4xl font-bold mb-2">Terms of Service</h1>
        <p className="text-muted-foreground mb-8">Last updated: December 2025</p>

        <div className="prose prose-gray dark:prose-invert max-w-none space-y-6">
          <section>
            <h2 className="text-2xl font-semibold mt-8 mb-4">1. Acceptance of Terms</h2>
            <p className="text-muted-foreground leading-relaxed">
              By accessing or using QueryPanel&apos;s services, you agree to be bound by these Terms of Service. If you do not agree to these terms, please do not use our services.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mt-8 mb-4">2. Description of Service</h2>
            <p className="text-muted-foreground leading-relaxed">
              QueryPanel provides a natural language to SQL SDK that enables developers to build AI-powered analytics into their applications. Our service generates SQL queries based on schema metadata you provide.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mt-8 mb-4">3. User Responsibilities</h2>
            <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
              <li>You are responsible for maintaining the security of your account credentials</li>
              <li>You must ensure you have the right to use any data you process through our service</li>
              <li>You agree not to use our service for any illegal or unauthorized purpose</li>
              <li>You are responsible for the security of your own database infrastructure</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mt-8 mb-4">4. Data Handling</h2>
            <p className="text-muted-foreground leading-relaxed">
              QueryPanel does not store your database credentials. We only store schema metadata necessary for SQL generation. All query execution occurs in your infrastructure using your own database connections.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mt-8 mb-4">5. Intellectual Property</h2>
            <p className="text-muted-foreground leading-relaxed">
              QueryPanel retains all rights to our software, documentation, and services. You retain all rights to your data and any applications you build using our SDK.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mt-8 mb-4">6. Limitation of Liability</h2>
            <p className="text-muted-foreground leading-relaxed">
              QueryPanel shall not be liable for any indirect, incidental, special, consequential, or punitive damages resulting from your use of our service. Our total liability shall not exceed the amount you paid us in the 12 months preceding the claim.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mt-8 mb-4">7. Termination</h2>
            <p className="text-muted-foreground leading-relaxed">
              We may terminate or suspend your access to our service at any time, with or without cause. Upon termination, your right to use the service will immediately cease.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mt-8 mb-4">8. Changes to Terms</h2>
            <p className="text-muted-foreground leading-relaxed">
              We reserve the right to modify these terms at any time. We will notify you of significant changes via email or through our service.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mt-8 mb-4">9. Contact</h2>
            <p className="text-muted-foreground leading-relaxed">
              For questions about these Terms of Service, contact us at legal@querypanel.io
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}
