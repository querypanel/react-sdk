import { createAdminClient } from "@/lib/supabase/admin";

export async function executeSql(
  sqlQuery: string,
  params?: unknown[]
): Promise<{ rows: Array<Record<string, unknown>>; fields: Array<{ name: string }> }> {
  const client = createAdminClient();
  
  try {
    console.log("[Demo PG] Executing query via RPC, length:", sqlQuery?.length);
    
    // Call the exec_sql RPC function to execute raw SQL
    // Note: params are passed as JSON array in the RPC call
    const { data, error } = await client.rpc("exec_sql", {
      query: sqlQuery,
      params: params || [],
    });
    
    if (error) {
      console.error("[Demo PG] RPC error:", error);
      throw new Error(`SQL execution failed: ${error.message}`);
    }
    
    // Data is returned as a JSON array from the RPC function
    const rows = (data ?? []) as Array<Record<string, unknown>>;
    
    // Extract field names from the first row (if any)
    const fields = rows.length > 0 
      ? Object.keys(rows[0]).map(name => ({ name }))
      : [];
    
    console.log("[Demo PG] Query success, rows:", rows.length);
    
    return { rows, fields };
  } catch (error) {
    console.error("[Demo PG] SQL execution error:", error);
    throw error;
  }
}
