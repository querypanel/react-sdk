import { useEffect, useState, useCallback, useMemo } from "react";
import { DashboardAiEditor } from "./DashboardAiEditor";
import type { Dashboard } from "../types";
import type { ColorPreset, Theme } from "../types";
import { createTheme, getColorsByPreset } from "../themes";

export interface QuerypanelEmbeddedProps {
  /** Dashboard ID to display */
  dashboardId: string;
  /** Customer backend base URL (same-origin or backend domain) */
  apiBaseUrl?: string;

  /** Enable customer customization (copy-on-write) */
  allowCustomization?: boolean;

  /** Color preset for theming */
  colorPreset?: ColorPreset;
  /** Custom theme override */
  theme?: Partial<Theme>;
  /** Use dark mode */
  darkMode?: boolean;

  /** Callbacks */
  onError?: (error: Error) => void;
  onLoad?: (dashboard: Dashboard) => void;
  onCustomize?: (forkedDashboard: Dashboard) => void;
}

/**
 * Embedded dashboard component with optional customer customization
 */
export function QuerypanelEmbedded({
  dashboardId,
  apiBaseUrl = "",
  allowCustomization = false,
  colorPreset = "default",
  theme,
  darkMode = false,
  onError,
  onLoad,
  onCustomize,
}: QuerypanelEmbeddedProps) {
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isFork, setIsFork] = useState(false);
  const [editorResetKey, setEditorResetKey] = useState(0);

  const normalizedApiBaseUrl = apiBaseUrl.replace(/\/+$/, "");
  const resolvedTheme = useMemo(
    () =>
      createTheme({
        ...theme,
        name: theme?.name || colorPreset,
        colors: {
          ...getColorsByPreset(colorPreset),
          ...(theme?.colors || {}),
        },
      }),
    [colorPreset, theme]
  );
  const toolbarStyles = useMemo(
    () => ({
      container: {
        backgroundColor: darkMode ? resolvedTheme.colors.background : "#ffffff",
        borderColor: darkMode ? resolvedTheme.colors.border : `${resolvedTheme.colors.primary}22`,
        color: darkMode ? resolvedTheme.colors.text : "#0f172a",
      },
      title: {
        color: darkMode ? resolvedTheme.colors.text : "#0f172a",
      },
      badge: {
        backgroundColor: `${resolvedTheme.colors.primary}22`,
        color: darkMode ? resolvedTheme.colors.text : resolvedTheme.colors.primary,
        borderColor: `${resolvedTheme.colors.primary}44`,
      },
      primaryButton: {
        backgroundColor: resolvedTheme.colors.primary,
        color: "#ffffff",
        borderColor: resolvedTheme.colors.primary,
      },
      secondaryButton: {
        backgroundColor: darkMode ? "rgba(255,255,255,0.04)" : "#f8fafc",
        color: darkMode ? resolvedTheme.colors.text : "#0f172a",
        borderColor: darkMode ? resolvedTheme.colors.border : "#cbd5e1",
      },
      dangerButton: {
        backgroundColor: darkMode ? "rgba(239,68,68,0.18)" : "#fef2f2",
        color: darkMode ? "#fecaca" : "#b91c1c",
        borderColor: darkMode ? "rgba(239,68,68,0.35)" : "#fca5a5",
      },
    }),
    [darkMode, resolvedTheme]
  );

  const exitEditMode = useCallback(() => {
    // Reset the editor to persisted dashboard content when leaving edit mode.
    setEditorResetKey((prev) => prev + 1);
    setIsEditing(false);
  }, []);

  // Fetch dashboard (or fork if exists)
  const fetchDashboard = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      // Backend resolves auth/tenant context server-side.
      const response = await fetch(
        `${normalizedApiBaseUrl}/dashboards/${dashboardId}/for-tenant`,
        {
          credentials: "include",
          headers: { "Content-Type": "application/json" },
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to fetch dashboard: ${response.statusText}`);
      }

      const data: Dashboard = await response.json();
      if (data.dashboard_type === "internal") {
        setDashboard(null);
        setIsFork(false);
        throw new Error("This dashboard is not available for embedding.");
      }
      setDashboard(data);
      setIsFork(data.is_customer_fork);
      onLoad?.(data);
    } catch (err) {
      const error = err instanceof Error ? err : new Error("Unknown error");
      setError(error.message);
      onError?.(error);
    } finally {
      setLoading(false);
    }
  }, [normalizedApiBaseUrl, dashboardId, onLoad, onError]);

  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard]);

  // Fork the dashboard
  const handleFork = async () => {
    try {
      // Backend resolves auth/tenant context server-side.
      const response = await fetch(`${normalizedApiBaseUrl}/dashboards/${dashboardId}/fork`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({}),
      });

      if (!response.ok) {
        throw new Error(`Failed to fork dashboard: ${response.statusText}`);
      }

      const fork: Dashboard = await response.json();
      setDashboard(fork);
      setIsFork(true);
      setIsEditing(true);
      onCustomize?.(fork);
    } catch (err) {
      const error = err instanceof Error ? err : new Error("Unknown error");
      setError(error.message);
      onError?.(error);
    }
  };

  // Save fork changes
  const handleSave = async (content: string, _options?: { deploy?: boolean }) => {
    if (!dashboard) return;

    try {
      // Backend resolves auth/tenant context server-side.
      const response = await fetch(`${normalizedApiBaseUrl}/dashboards/forks/${dashboard.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
          content_json: content,
        }),
      });

      if (!response.ok) {
        throw new Error(`Failed to save fork: ${response.statusText}`);
      }

      const updated: Dashboard = await response.json();
      setDashboard(updated);
      exitEditMode();
    } catch (err) {
      const error = err instanceof Error ? err : new Error("Unknown error");
      setError(error.message);
      onError?.(error);
    }
  };

  // Rollback to original
  const handleRollback = async () => {
    if (!dashboard) return;

    if (!confirm("Reset to original dashboard? Your customizations will be lost.")) {
      return;
    }

    try {
      // Backend resolves auth/tenant context server-side.
      const response = await fetch(
        `${normalizedApiBaseUrl}/dashboards/forks/${dashboard.id}/rollback`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          credentials: "include",
          body: JSON.stringify({}),
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to rollback fork: ${response.statusText}`);
      }

      const original: Dashboard = await response.json();
      setDashboard(original);
      setIsFork(false);
      exitEditMode();
    } catch (err) {
      const error = err instanceof Error ? err : new Error("Unknown error");
      setError(error.message);
      onError?.(error);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div
          className="w-8 h-8 border-4 border-t-transparent rounded-full animate-spin"
          style={{ borderColor: resolvedTheme.colors.primary }}
        />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 bg-red-50 dark:bg-red-900/20 rounded-lg">
        <h3 className="text-lg font-semibold text-red-900 dark:text-red-100 mb-2">
          Error Loading Dashboard
        </h3>
        <p className="text-red-700 dark:text-red-300">{error}</p>
      </div>
    );
  }

  if (!dashboard) {
    return (
      <div className="p-6 bg-gray-50 dark:bg-gray-900 rounded-lg">
        <p className="text-gray-700 dark:text-gray-300">Dashboard not found</p>
      </div>
    );
  }

  return (
    <div className="querypanel-embedded">
      {/* Toolbar */}
      {allowCustomization && (
        <div
          className="flex flex-wrap items-center justify-between gap-3 mb-4 p-4 rounded-xl border"
          style={toolbarStyles.container}
        >
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-semibold" style={toolbarStyles.title}>
              {dashboard.name}
            </h2>
            {isFork && (
              <span
                className="px-2 py-1 text-xs font-semibold rounded-md border"
                style={toolbarStyles.badge}
              >
                Customized
              </span>
            )}
          </div>
          <div className="flex items-center flex-wrap gap-2">
            {!isEditing && !isFork && (
              <button
                type="button"
                onClick={handleFork}
                className="px-4 py-2 text-sm font-semibold rounded-lg border transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
                style={toolbarStyles.primaryButton}
              >
                Customize Dashboard
              </button>
            )}
            {!isEditing && isFork && (
              <>
                <button
                  type="button"
                  onClick={() => setIsEditing(true)}
                  className="px-4 py-2 text-sm font-semibold rounded-lg border transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
                  style={toolbarStyles.primaryButton}
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={handleRollback}
                  className="px-4 py-2 text-sm font-semibold rounded-lg border transition-colors hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
                  style={toolbarStyles.dangerButton}
                >
                  Reset to Original
                </button>
              </>
            )}
            {isEditing && (
              <button
                type="button"
                onClick={exitEditMode}
                className="px-4 py-2 text-sm font-semibold rounded-lg border transition-colors hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
                style={toolbarStyles.secondaryButton}
              >
                Cancel
              </button>
            )}
          </div>
        </div>
      )}

      {/* Content */}
      <DashboardAiEditor
        initialContent={dashboard.content_json || ""}
        onSave={handleSave}
        organizationId={dashboard.organization_id}
        dashboardId={dashboard.id}
        dashboardType={dashboard.dashboard_type ?? "customer"}
        showDeployButton={false}
        editable={isEditing}
        contentResetKey={editorResetKey}
        apiBaseUrl={normalizedApiBaseUrl || undefined}
        darkMode={darkMode}
        themeColors={resolvedTheme.colors}
        fontFamily={resolvedTheme.fontFamily}
        className="min-h-[400px]"
      />
    </div>
  );
}
