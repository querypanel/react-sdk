"use client";

import { useEffect, useRef, useState } from "react";
import { useTheme } from "next-themes";

interface MermaidDiagramProps {
  children: string;
}

export function MermaidDiagram({ children }: MermaidDiagramProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!ref.current || !mounted) return;

    const renderMermaid = async () => {
      try {
        const mermaid = await import("mermaid");
        
        const element = ref.current;
        if (!element) return;
        
        // Clear previous render
        element.innerHTML = "";
        element.textContent = children.trim();
        
        // Determine theme - use resolvedTheme to handle system theme
        const isDark = resolvedTheme === "dark" || (resolvedTheme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
        const mermaidTheme = isDark ? "dark" : "default";
        
        // Re-initialize mermaid with the correct theme each time
        mermaid.default.initialize({
          startOnLoad: false,
          theme: mermaidTheme,
          securityLevel: "loose",
          fontFamily: "inherit",
          flowchart: {
            useMaxWidth: true,
            htmlLabels: true,
          },
          sequence: {
            diagramMarginX: 50,
            diagramMarginY: 10,
            actorMargin: 80,
            width: 150,
            height: 65,
            boxMargin: 10,
            boxTextMargin: 5,
            noteMargin: 10,
            messageMargin: 35,
            mirrorActors: false,
            bottomMarginAdj: 1,
            useMaxWidth: true,
            rightAngles: false,
            showSequenceNumbers: false,
          },
        });

        const id = `mermaid-${Math.random().toString(36).substr(2, 9)}`;
        element.id = id;
        
        await mermaid.default.run({
          nodes: [element],
          suppressErrors: false,
        });
      } catch (err) {
        console.error("Failed to render Mermaid diagram:", err);
        setError(err instanceof Error ? err.message : "Failed to render diagram");
      }
    };

    renderMermaid();
  }, [children, mounted, resolvedTheme]);

  if (error) {
    return (
      <div className="my-8 p-4 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded-lg">
        <p className="text-sm text-red-600 dark:text-red-400">
          Failed to render Mermaid diagram: {error}
        </p>
        <pre className="mt-2 text-xs text-red-700 dark:text-red-300 overflow-x-auto">
          {children}
        </pre>
      </div>
    );
  }

  return (
    <div className="my-8 w-full overflow-x-auto">
      <div className="flex justify-center py-4">
        <div
          ref={ref}
          className="mermaid bg-transparent animate-in fade-in duration-500"
          style={{ 
            width: "100%",
            maxWidth: "100%",
          }}
        />
      </div>
    </div>
  );
}
