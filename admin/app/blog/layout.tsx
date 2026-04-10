import type { Metadata } from "next";
import LandingNav from "@/components/layout/LandingNav";
import { BlogVercelTracker } from "@/components/blog/BlogVercelTracker";

export const metadata: Metadata = {
  title: "Blog - QueryPanel",
  description: "Latest articles, tutorials, and updates about QueryPanel - Natural Language to SQL SDK",
};

export default function BlogLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <LandingNav />
      <BlogVercelTracker />
      {children}
    </>
  );
}
