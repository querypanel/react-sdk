"use client";

import React from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowLeftIcon } from "lucide-react";

export default function AcceptableUsePolicyPage() {
  return (
    <main className="min-h-screen bg-background">
      <div className="container max-w-4xl mx-auto px-4 py-12">
        <Link href="/">
          <Button variant="ghost" className="mb-8">
            <ArrowLeftIcon className="w-4 h-4 mr-2" />
            Back to Home
          </Button>
        </Link>

        <h1 className="text-4xl font-bold mb-2">Acceptable Use Policy</h1>
        <p className="text-muted-foreground mb-8">Last updated: December 2025</p>

        <div className="prose prose-gray dark:prose-invert max-w-none space-y-6">
          <section>
            <h2 className="text-2xl font-semibold mt-8 mb-4">1. Purpose</h2>
            <p className="text-muted-foreground leading-relaxed">
              This Acceptable Use Policy outlines the rules and guidelines for using QueryPanel&apos;s services. By using our service, you agree to comply with this policy.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mt-8 mb-4">2. Prohibited Uses</h2>
            <p className="text-muted-foreground leading-relaxed mb-4">
              You may not use QueryPanel&apos;s services to:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
              <li>Violate any applicable laws or regulations</li>
              <li>Infringe on intellectual property rights of others</li>
              <li>Transmit malicious code or attempt to compromise our systems</li>
              <li>Access data you are not authorized to access</li>
              <li>Interfere with or disrupt our services or servers</li>
              <li>Attempt to reverse engineer our software</li>
              <li>Use our service to build a competing product</li>
              <li>Resell or redistribute our service without authorization</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mt-8 mb-4">3. Data Responsibilities</h2>
            <p className="text-muted-foreground leading-relaxed">
              You are responsible for ensuring that any data you process through QueryPanel complies with applicable data protection laws. You must have proper authorization to use and process any data connected to our service.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mt-8 mb-4">4. Rate Limits and Fair Use</h2>
            <p className="text-muted-foreground leading-relaxed">
              To ensure service quality for all users, we may implement rate limits. Excessive use that impacts other users may result in temporary restrictions on your account.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mt-8 mb-4">5. Enforcement</h2>
            <p className="text-muted-foreground leading-relaxed">
              Violations of this policy may result in suspension or termination of your account. We reserve the right to take appropriate action, including legal action, for serious violations.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mt-8 mb-4">6. Reporting Violations</h2>
            <p className="text-muted-foreground leading-relaxed">
              If you become aware of any violations of this policy, please report them to abuse@querypanel.io
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}
