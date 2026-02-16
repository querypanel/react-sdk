"use client";

import { useState, useEffect, useRef } from "react";
import { DatabaseIcon, ChevronDownIcon } from "lucide-react";

type Datasource = {
  id: string;
  name: string;
  dialect: "postgres" | "clickhouse";
  has_password?: boolean;
};

export interface DatasourceSelectorProps {
  /** Organization ID for the request header */
  organizationId: string;
  /** Currently selected datasource IDs */
  selectedIds: string[];
  /** Callback when selection changes */
  onSelectionChange: (ids: string[]) => void;
  /** URL to fetch datasources from (default: /api/datasources) */
  datasourcesUrl?: string;
  /** Optional extra headers for the fetch request */
  headers?: Record<string, string>;
}

export function DatasourceSelector({
  organizationId,
  selectedIds,
  onSelectionChange,
  datasourcesUrl = "/api/datasources",
  headers = {},
}: DatasourceSelectorProps) {
  const [datasources, setDatasources] = useState<Datasource[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fetchDatasources = async () => {
      try {
        const response = await fetch(datasourcesUrl, {
          headers: {
            "Content-Type": "application/json",
            "x-organization-id": organizationId,
            ...headers,
          },
        });

        if (response.ok) {
          const data = await response.json();
          setDatasources(data.datasources || []);
        }
      } catch (error) {
        console.error("Failed to fetch datasources:", error);
      } finally {
        setLoading(false);
      }
    };

    if (organizationId) {
      void fetchDatasources();
    }
  }, [organizationId, datasourcesUrl, headers]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleToggle = (id: string) => {
    const newSelection = selectedIds.includes(id)
      ? selectedIds.filter((sid) => sid !== id)
      : [...selectedIds, id];
    onSelectionChange(newSelection);
  };

  const selectedDatasources = datasources.filter((ds) => selectedIds.includes(ds.id));

  if (loading) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "0.5rem",
          fontSize: "0.875rem",
          color: "#64748b",
        }}
      >
        <DatabaseIcon size={16} style={{ animation: "pulse 1.5s ease-in-out infinite" }} />
        Loading datasources...
      </div>
    );
  }

  if (datasources.length === 0) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "0.5rem",
          fontSize: "0.875rem",
          color: "#64748b",
        }}
      >
        <DatabaseIcon size={16} />
        No datasources configured
      </div>
    );
  }

  return (
    <div ref={containerRef} style={{ position: "relative" }}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: "0.5rem",
          padding: "0.375rem 0.75rem",
          fontSize: "0.875rem",
          border: "1px solid #e2e8f0",
          borderRadius: "0.375rem",
          background: "#fff",
          cursor: "pointer",
        }}
      >
        <DatabaseIcon size={16} />
        {selectedDatasources.length > 0 ? (
          <>
            {selectedDatasources.length === 1
              ? selectedDatasources[0].name
              : `${selectedDatasources.length} datasources`}
          </>
        ) : (
          "Select datasources"
        )}
        <ChevronDownIcon size={16} style={{ marginLeft: "0.25rem" }} />
      </button>

      {open && (
        <div
          style={{
            position: "absolute",
            top: "100%",
            left: 0,
            marginTop: "0.25rem",
            minWidth: "16rem",
            padding: "0.5rem",
            background: "#fff",
            border: "1px solid #e2e8f0",
            borderRadius: "0.5rem",
            boxShadow: "0 10px 15px -3px rgba(0,0,0,0.1)",
            zIndex: 50,
          }}
        >
          <div
            style={{
              padding: "0.5rem 0.75rem",
              fontSize: "0.75rem",
              fontWeight: 600,
              color: "#64748b",
              textTransform: "uppercase",
            }}
          >
            Data Sources
          </div>
          <div style={{ borderTop: "1px solid #e2e8f0", margin: "0.25rem 0" }} />
          {datasources.map((ds) => (
            <label
              key={ds.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
                padding: "0.5rem 0.75rem",
                cursor: "pointer",
                borderRadius: "0.25rem",
              }}
            >
              <input
                type="checkbox"
                checked={selectedIds.includes(ds.id)}
                onChange={() => handleToggle(ds.id)}
                style={{ margin: 0 }}
              />
              <DatabaseIcon size={16} />
              <span style={{ flex: 1, fontSize: "0.875rem" }}>{ds.name}</span>
              <span
                style={{
                  fontSize: "0.625rem",
                  padding: "0.125rem 0.375rem",
                  background: "#f1f5f9",
                  borderRadius: "0.25rem",
                }}
              >
                {ds.dialect}
              </span>
            </label>
          ))}
          {selectedDatasources.length > 0 && (
            <>
              <div style={{ borderTop: "1px solid #e2e8f0", margin: "0.25rem 0" }} />
              <div
                style={{
                  padding: "0.375rem 0.75rem",
                  fontSize: "0.75rem",
                  color: "#64748b",
                }}
              >
                {selectedDatasources.length} selected
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
