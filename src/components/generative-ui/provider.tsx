"use client";

import React from "react";
import {
  ActionProvider,
  StateProvider,
  VisibilityProvider,
} from "@json-render/react";

type GenerativeUIConfig = {
  queryResultBaseUrl: string;
  requestHeaders?: Record<string, string>;
  /** Optional actions rendered on the right of ChartShell's title row (e.g. pinned cog). */
  headerActions?: React.ReactNode;
};

const GenerativeUIConfigContext = React.createContext<GenerativeUIConfig>({
  // Security default: result-artifact fetching is opt-in.
  queryResultBaseUrl: "",
});

export function GenerativeUIProvider({
  children,
  queryResultBaseUrl = "",
  requestHeaders,
  headerActions,
}: {
  children: React.ReactNode;
  queryResultBaseUrl?: string;
  requestHeaders?: Record<string, string>;
  headerActions?: React.ReactNode;
}) {
  const value = React.useMemo(
    () => ({ queryResultBaseUrl, requestHeaders, headerActions }),
    [queryResultBaseUrl, requestHeaders, headerActions]
  );

  return (
    <GenerativeUIConfigContext.Provider value={value}>
      <StateProvider>
        <ActionProvider handlers={{}}>
          <VisibilityProvider>{children}</VisibilityProvider>
        </ActionProvider>
      </StateProvider>
    </GenerativeUIConfigContext.Provider>
  );
}

export function useGenerativeUIConfig() {
  return React.useContext(GenerativeUIConfigContext);
}
