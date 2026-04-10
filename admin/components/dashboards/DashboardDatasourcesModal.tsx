"use client";

import { useCallback, useEffect, useId, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { DatabaseIcon } from "lucide-react";
import { toast } from "sonner";

type DatasourceItem = { id: string; name: string; dialect: string };

/** Map datasource id -> tenant column name (e.g. tenant_id, customer_id). */
export type TenantFieldByDatasource = Record<string, string>;

export interface DashboardDatasourcesModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dashboardId: string;
  organizationId: string;
  initialAvailableDatasourceIds: string[] | null;
  initialTenantFieldName: string | null;
  initialTenantFieldByDatasource: TenantFieldByDatasource | null;
  onSaved?: (
    availableDatasourceIds: string[] | null,
    tenantFieldName: string | null,
    tenantFieldByDatasource: TenantFieldByDatasource | null
  ) => void;
}

export function DashboardDatasourcesModal({
  open,
  onOpenChange,
  dashboardId,
  organizationId,
  initialAvailableDatasourceIds,
  initialTenantFieldName,
  initialTenantFieldByDatasource,
  onSaved,
}: DashboardDatasourcesModalProps) {
  const [datasources, setDatasources] = useState<DatasourceItem[]>([]);
  const [loadingDatasources, setLoadingDatasources] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [defaultTenantField, setDefaultTenantField] = useState("tenant_id");
  const [tenantByDs, setTenantByDs] = useState<TenantFieldByDatasource>({});
  const defaultFieldId = useId();

  const loadDatasources = useCallback(async () => {
    if (!organizationId) return;
    setLoadingDatasources(true);
    try {
      const res = await fetch("/api/datasources", {
        headers: { "x-organization-id": organizationId },
      });
      if (!res.ok) throw new Error("Failed to load datasources");
      const data = await res.json();
      setDatasources(data.datasources ?? []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load datasources");
    } finally {
      setLoadingDatasources(false);
    }
  }, [organizationId]);

  useEffect(() => {
    if (open) {
      loadDatasources();
      setSelectedIds(initialAvailableDatasourceIds ?? []);
      setDefaultTenantField(initialTenantFieldName?.trim() || "tenant_id");
      setTenantByDs(initialTenantFieldByDatasource ?? {});
    }
  }, [open, loadDatasources, initialAvailableDatasourceIds, initialTenantFieldName, initialTenantFieldByDatasource]);

  const handleToggle = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const setTenantFieldForDatasource = (datasourceId: string, value: string) => {
    setTenantByDs((prev) => {
      const next = { ...prev };
      const trimmed = value.trim();
      if (trimmed) next[datasourceId] = trimmed;
      else delete next[datasourceId];
      return next;
    });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload = {
        available_datasource_ids: selectedIds.length > 0 ? selectedIds : null,
        tenant_field_name: defaultTenantField.trim() || null,
        tenant_field_by_datasource: Object.keys(tenantByDs).length ? tenantByDs : null,
      };
      const res = await fetch(`/api/dashboards/${dashboardId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "x-organization-id": organizationId,
        },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("Failed to save");
      toast.success("Datasources and tenant fields saved");
      onSaved?.(
        payload.available_datasource_ids,
        payload.tenant_field_name,
        payload.tenant_field_by_datasource
      );
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const selectedDatasources = datasources.filter((ds) => selectedIds.includes(ds.id));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Datasources & tenant fields</DialogTitle>
          <DialogDescription>
            Choose which datasources customers can use and the tenant column name per datasource
            (different DBs may use different column names, e.g. tenant_id vs customer_id).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>Available datasources</Label>
            {loadingDatasources ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : datasources.length === 0 ? (
              <p className="text-sm text-muted-foreground">No datasources in this workspace.</p>
            ) : (
              <div className="max-h-48 overflow-y-auto rounded-md border border-input bg-muted/30 p-2 space-y-1">
                {datasources.map((ds) => (
                  <label
                    key={ds.id}
                    className="flex items-center gap-2 rounded px-2 py-1.5 hover:bg-muted/50 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(ds.id)}
                      onChange={() => handleToggle(ds.id)}
                      className="rounded border-input"
                    />
                    <DatabaseIcon className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-medium">{ds.name}</span>
                    <span className="text-xs text-muted-foreground">{ds.dialect}</span>
                  </label>
                ))}
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              Leave none selected to allow all org datasources for this dashboard.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor={defaultFieldId}>Default tenant field name</Label>
            <Input
              id={defaultFieldId}
              value={defaultTenantField}
              onChange={(e) => setDefaultTenantField(e.target.value)}
              placeholder="e.g. tenant_id"
              className="font-mono"
            />
            <p className="text-xs text-muted-foreground">
              Used when a datasource has no specific override below.
            </p>
          </div>

          {selectedDatasources.length > 0 && (
            <div className="space-y-2">
              <Label>Tenant field per datasource</Label>
              <div className="max-h-40 overflow-y-auto rounded-md border border-input bg-muted/30 p-2 space-y-2">
                {selectedDatasources.map((ds) => (
                  <div key={ds.id} className="flex items-center gap-2">
                    <span className="text-sm font-medium shrink-0 min-w-[120px] truncate" title={ds.name}>
                      {ds.name}
                    </span>
                    <Input
                      value={tenantByDs[ds.id] ?? ""}
                      onChange={(e) => setTenantFieldForDatasource(ds.id, e.target.value)}
                      placeholder={defaultTenantField || "tenant_id"}
                      className="font-mono h-8 text-sm"
                    />
                  </div>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                Override the tenant column name for each datasource (e.g. tenant_id, customer_id).
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
