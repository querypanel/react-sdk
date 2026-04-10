"use client";

import { Button } from "@/components/ui/button";
import { trackEvent } from "@/lib/analytics/mixpanel";

const REACT_SDK_NPM = "https://www.npmjs.com/package/@querypanel/react-sdk";
const STORYBOOK = "http://storybook.querypanel.io/";
const NODE_SDK_NPM = "https://www.npmjs.com/package/@querypanel/node-sdk";

function trackSdkLink(kind: "react_npm" | "storybook" | "node_npm") {
  trackEvent("SDK Docs Button Clicked", {
    location: "onboarding_page",
    link: kind,
  });
}

export default function SDKDocsButton() {
  return (
    <div className="flex flex-wrap gap-2">
      <Button asChild variant="outline" size="sm">
        <a
          href={REACT_SDK_NPM}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => trackSdkLink("react_npm")}
        >
          React SDK (npm)
        </a>
      </Button>
      <Button asChild variant="outline" size="sm">
        <a
          href={STORYBOOK}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => trackSdkLink("storybook")}
        >
          Storybook
        </a>
      </Button>
      <Button
        asChild
        size="sm"
        className="bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700"
      >
        <a
          href={NODE_SDK_NPM}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => trackSdkLink("node_npm")}
        >
          Node SDK (npm)
        </a>
      </Button>
    </div>
  );
}
