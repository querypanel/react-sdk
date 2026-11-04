"use client";

import { useMemo, type ReactNode } from "react";
import { autoFixSpec, type Spec } from "@json-render/core";
import { Renderer } from "@json-render/react";
import { registry } from "./registry";
import { GenerativeUIProvider } from "./provider";
import { isMapVizSpec } from "../mapKind";

export function PersistedSpecRenderer({
  spec,
  queryResultBaseUrl = "",
  requestHeaders,
  headerActions,
}: {
  spec: unknown;
  queryResultBaseUrl?: string;
  requestHeaders?: Record<string, string>;
  headerActions?: ReactNode;
}) {
  const fixedSpec = useMemo(() => {
    if (!spec || typeof spec !== "object") return null;
    return autoFixSpec(spec as Spec).spec;
  }, [spec]);

  if (!fixedSpec) return null;

  // Map specs are not json-render trees. Dashboard blocks and report previews draw them with
  // VizSpecMap before reaching this renderer, so this only guards a stray caller.
  if (isMapVizSpec(spec)) {
    return <div style={{ fontSize: "0.875rem", opacity: 0.7 }}>Map preview is not available here.</div>;
  }

  return (
    <GenerativeUIProvider
      queryResultBaseUrl={queryResultBaseUrl}
      requestHeaders={requestHeaders}
      headerActions={headerActions}
    >
      <Renderer spec={fixedSpec} registry={registry} />
    </GenerativeUIProvider>
  );
}
