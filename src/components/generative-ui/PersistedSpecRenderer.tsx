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

  // Map specs are not json-render trees; dashboard blocks render them with VizSpecMap (JsonRenderChartBlock).
  if (isMapVizSpec(spec) || !fixedSpec) return null;

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
