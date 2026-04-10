/**
 * Types for active charts (sdk_active_charts table)
 */

/**
 * Active chart database record from sdk_active_charts table
 */
export interface ActiveChartRecord {
	id: string;
	organization_id: string;
	tenant_id: string;
	user_id: string | null;
	chart_id: string;
	order: number | null;
	meta: Record<string, unknown> | null;
	created_at: string;
	updated_at: string;
}

/**
 * Active chart with related chart data
 */
export interface ActiveChartWithChart extends ActiveChartRecord {
	chart: Record<string, unknown> | null;
}

/**
 * Insert payload for creating an active chart
 */
export interface ActiveChartInsertPayload {
	organization_id: string;
	tenant_id: string;
	user_id: string | null;
	chart_id: string;
	order: number | null;
	meta: Record<string, unknown> | null;
}

/**
 * Update payload for updating an active chart
 */
export interface ActiveChartUpdatePayload {
	chart_id?: string;
	order?: number | null;
	meta?: Record<string, unknown> | null;
	updated_at?: string;
}
