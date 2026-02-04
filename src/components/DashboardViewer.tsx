import { useEffect, useState, useMemo } from "react";
import { useCreateBlockNote } from "@blocknote/react";
import { BlockNoteView } from "@blocknote/mantine";
import "@blocknote/mantine/style.css";

export interface DashboardViewerProps {
  /** BlockNote content as JSON string */
  content: string;
  /** Whether to use dark theme */
  darkMode?: boolean;
  /** Custom CSS class */
  className?: string;
}

/**
 * Read-only dashboard viewer using BlockNote
 */
export function DashboardViewer({
  content,
  darkMode = false,
  className = "",
}: DashboardViewerProps) {
  const [mounted, setMounted] = useState(false);

  // Parse content once when it changes
  const parsedContent = useMemo(() => {
    try {
      if (content) {
        return JSON.parse(content);
      }
    } catch (e) {
      console.error("Failed to parse dashboard content:", e);
    }
    // Return default empty content if parsing fails
    return [
      {
        type: "paragraph",
        content: [],
      },
    ];
  }, [content]);

  // Create editor with parsed content
  const editor = useCreateBlockNote({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    initialContent: parsedContent as any,
  });

  // Client-side only rendering to avoid hydration mismatch
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div className={`flex items-center justify-center py-16 ${className}`}>
        <div
          className="w-6 h-6 border-2 border-t-transparent rounded-full animate-spin"
          style={{ borderColor: "currentColor" }}
        />
      </div>
    );
  }

  return (
    <div className={className} data-theme={darkMode ? "dark" : "light"}>
      <BlockNoteView editor={editor} editable={false} theme={darkMode ? "dark" : "light"} />
    </div>
  );
}
