"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { track } from "@vercel/analytics";

function getBlogSlugFromPathname(pathname: string): string | null {
  const prefix = "/blog/";
  if (!pathname.startsWith(prefix)) return null;
  const slug = pathname.slice(prefix.length);
  return slug || null;
}

export function BlogVercelTracker(): React.ReactNode {
  const pathname = usePathname();

  useEffect(() => {
    // Mounted under /blog layout, but keep it defensive.
    if (pathname !== "/blog" && !pathname.startsWith("/blog/")) return;
    if (typeof window === "undefined") return;

    const slug = getBlogSlugFromPathname(pathname);
    const query = window.location.search;
    const fullPath = query ? `${pathname}${query}` : pathname;

    track("blog_page_view", {
      path: pathname,
      fullPath,
      ...(slug ? { slug } : {}),
    });
  }, [pathname]);

  return null;
}

