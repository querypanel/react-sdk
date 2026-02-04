import { useState, useEffect, useMemo } from "react";
import { useCreateBlockNote } from "@blocknote/react";
import { BlockNoteView } from "@blocknote/mantine";
import "@blocknote/mantine/style.css";

export interface DashboardEditorProps {
  /** Initial BlockNote content as JSON string */
  initialContent: string;
  /** Callback when save is clicked */
  onSave: (content: string) => Promise<void>;
  /** Whether to use dark theme */
  darkMode?: boolean;
  /** Custom CSS class */
  className?: string;
}

/**
 * Editable dashboard editor using BlockNote
 */
export function DashboardEditor({
  initialContent,
  onSave,
  darkMode = false,
  className = "",
}: DashboardEditorProps) {
  const [isSaving, setIsSaving] = useState(false);
  const [mounted, setMounted] = useState(false);

  // Parse content once when it changes
  const parsedContent = useMemo(() => {
    try {
      if (initialContent) {
        return JSON.parse(initialContent);
      }
    } catch (e) {
      console.error("Failed to parse initial content:", e);
    }
    // Return default empty content if parsing fails
    return [
      {
        type: "paragraph",
        content: [],
      },
    ];
  }, [initialContent]);

  // Create editor with parsed content
  const editor = useCreateBlockNote({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    initialContent: parsedContent as any,
  });

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const content = JSON.stringify(editor.document);
      await onSave(content);
    } finally {
      setIsSaving(false);
    }
  };

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
    <div className={className}>
      {/* Save button */}
      <div className="flex justify-end mb-4">
        <button
          type="button"
          onClick={handleSave}
          disabled={isSaving}
          className="px-4 py-2 text-sm font-medium text-white bg-purple-600 hover:bg-purple-700 disabled:bg-purple-400 rounded-lg transition-colors"
        >
          {isSaving ? "Saving..." : "Save Changes"}
        </button>
      </div>

      {/* Editor */}
      <div
        className="border rounded-lg overflow-hidden"
        data-theme={darkMode ? "dark" : "light"}
      >
        <BlockNoteView editor={editor} theme={darkMode ? "dark" : "light"} />
      </div>
    </div>
  );
}
