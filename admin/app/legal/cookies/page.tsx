"use client";

import React from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowLeftIcon } from "lucide-react";

export default function CookiePolicyPage() {
  return (
    <main className="min-h-screen bg-background">
      <div className="container max-w-4xl mx-auto px-4 py-12">
        <Link href="/">
          <Button variant="ghost" className="mb-8">
            <ArrowLeftIcon className="w-4 h-4 mr-2" />
            Back to Home
          </Button>
        </Link>

        <h1 className="text-4xl font-bold mb-2">Cookie Policy</h1>
        <p className="text-muted-foreground mb-8">Last updated: December 2025</p>

        <div className="prose prose-gray dark:prose-invert max-w-none space-y-6">
          <section>
            <h2 className="text-2xl font-semibold mt-8 mb-4">1. What Are Cookies</h2>
            <p className="text-muted-foreground leading-relaxed">
              Cookies are small text files stored on your device when you visit a website. They help us provide you with a better experience by remembering your preferences and understanding how you use our service.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mt-8 mb-4">2. How We Use Cookies</h2>
            <h3 className="text-xl font-medium mt-6 mb-3">Essential Cookies</h3>
            <p className="text-muted-foreground leading-relaxed">
              These cookies are necessary for the website to function properly. They enable core functionality such as authentication and session management.
            </p>
            <h3 className="text-xl font-medium mt-6 mb-3">Analytics Cookies</h3>
            <p className="text-muted-foreground leading-relaxed">
              We use analytics cookies to understand how visitors interact with our website. This helps us improve our service and user experience.
            </p>
            <h3 className="text-xl font-medium mt-6 mb-3">Preference Cookies</h3>
            <p className="text-muted-foreground leading-relaxed">
              These cookies remember your settings and preferences, such as your preferred theme (light/dark mode).
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mt-8 mb-4">3. Third-Party Cookies</h2>
            <p className="text-muted-foreground leading-relaxed">
              We may use third-party services that set their own cookies, including:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-muted-foreground mt-4">
              <li>Vercel Analytics - for website performance monitoring</li>
              <li>Mixpanel - for product analytics</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mt-8 mb-4">4. Managing Cookies</h2>
            <p className="text-muted-foreground leading-relaxed">
              You can control and manage cookies through your browser settings. Please note that disabling certain cookies may affect the functionality of our service.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mt-8 mb-4">5. Contact Us</h2>
            <p className="text-muted-foreground leading-relaxed">
              If you have questions about our use of cookies, please contact us at privacy@querypanel.io
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}
