/**
 * Types for saved charts (sdk_charts table)
 */

/**
 * Chart database record from sdk_charts table
 */
export interface ChartRecord {
	id: string;
	query_id: string | null;
	organization_id: string | null;
	tenant_id: string | null;
	user_id: string | null;
	title: string;
	prompt: string | null;
	description: string | null;
	vega_lite_spec: Record<string, unknown>;
	spec_type?: 'vega-lite' | 'vizspec';
	sql: string;
	created_at: string;
	updated_at: string;
	target_db: string | null;
	sql_params: Record<string, unknown> | null;
}

/**
 * Chart with active status (includes sdk_active_charts join)
 */
export interface ChartWithActive extends ChartRecord {
	active: boolean;
	sdk_active_charts?: Array<{ id: string }>;
}

/**
 * Insert payload for creating a chart
 */
export interface ChartInsertPayload {
	organization_id: string;
	tenant_id: string | null;
	user_id: string | null;
	title: string;
	prompt: string | null;
	description: string | null;
	sql: string;
	sql_params: Record<string, unknown> | null;
	vega_lite_spec: Record<string, unknown>;
	spec_type?: 'vega-lite' | 'vizspec';
	query_id: string | null;
	target_db: string | null;
}

/**
 * Update payload for updating a chart
 */
export interface ChartUpdatePayload {
	title?: string;
	prompt?: string | null;
	description?: string | null;
	sql?: string;
	sql_params?: Record<string, unknown> | null;
	vega_lite_spec?: Record<string, unknown>;
	spec_type?: 'vega-lite' | 'vizspec';
	target_db?: string | null;
	updated_at?: string;
}
