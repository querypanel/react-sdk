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
};

const GenerativeUIConfigContext = React.createContext<GenerativeUIConfig>({
  queryResultBaseUrl: "/api/query-results",
});

export function GenerativeUIProvider({
  children,
  queryResultBaseUrl = "/api/query-results",
  requestHeaders,
}: {
  children: React.ReactNode;
  queryResultBaseUrl?: string;
  requestHeaders?: Record<string, string>;
}) {
  const value = React.useMemo(
    () => ({ queryResultBaseUrl, requestHeaders }),
    [queryResultBaseUrl, requestHeaders]
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
