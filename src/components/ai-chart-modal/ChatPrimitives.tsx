"use client";

import { useContext } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { PersistedSpecRenderer } from "../generative-ui/PersistedSpecRenderer";
import { NarrowLayoutContext } from "./narrowLayoutContext";
import type { ToolEvent } from "./types";

export function ThoughtSummaryRail({ events }: { events: ToolEvent[] }) {
  const startMs = Math.min(...events.map((e) => e.startedAt));
  const endMs = Math.max(...events.map((e) => e.endedAt ?? e.startedAt));
  const secs = ((endMs - startMs) / 1000).toFixed(1);

  return (
    <div className="qp-ai-modal-toolrail">
      <span className="qp-ai-modal-thought-label">Thought for {secs}s</span>
    </div>
  );
}

export function ChatMarkdown({ content }: { content: string }) {
  return (
    <div className="qp-ai-modal-markdown">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ node: _node, href, children, ...props }) => (
            <a
              {...props}
              href={href}
              target="_blank"
              rel="noreferrer"
            >
              {children}
            </a>
          ),
          table: ({ node: _node, children, ...props }) => (
            <div className="qp-ai-modal-markdown-table-wrap">
              <table {...props}>{children}</table>
            </div>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

export function JsonRenderPreview({
  spec,
  queryResultBaseUrl,
  requestHeaders,
}: {
  spec: unknown;
  queryResultBaseUrl: string;
  requestHeaders?: Record<string, string>;
}) {
  const isNarrowChart = useContext(NarrowLayoutContext);

  return (
    <div
      className={`qp-ai-modal-chart-preview${isNarrowChart ? " qp-ai-modal-chart-preview--narrow" : ""}`}
    >
      <PersistedSpecRenderer
        spec={spec}
        queryResultBaseUrl={queryResultBaseUrl}
        requestHeaders={requestHeaders}
      />
    </div>
  );
}
