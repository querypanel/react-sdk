"use client";

import { useMemo } from "react";
import type { UIMessage } from "ai";
import { autoFixSpec } from "@json-render/core";
import { Renderer, useJsonRenderMessage } from "@json-render/react";
import { registry } from "./registry";
import { GenerativeUIProvider } from "./provider";

export function MessageSpecRenderer({
  parts,
  queryResultBaseUrl = "",
  requestHeaders,
}: {
  parts: UIMessage["parts"];
  queryResultBaseUrl?: string;
  requestHeaders?: Record<string, string>;
}) {
  const { hasSpec, spec } = useJsonRenderMessage(parts);

  const fixedSpec = useMemo(
    () => (spec ? autoFixSpec(spec).spec : null),
    [spec]
  );

  if (!hasSpec || !fixedSpec) return null;

  return (
    <GenerativeUIProvider
      queryResultBaseUrl={queryResultBaseUrl}
      requestHeaders={requestHeaders}
    >
      <Renderer spec={fixedSpec} registry={registry} />
    </GenerativeUIProvider>
  );
}
