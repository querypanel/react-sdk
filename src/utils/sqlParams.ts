/**
 * Stored param metadata (`[{ name, value }]`, as sql_logs and dashboard chart rows keep it) as
 * the keyed record the SQL runner binds: index → `$1, $2, ...` plus the bare placeholder name.
 * Same contract as node-sdk mapGeneratedParams. Null when `params` is not an array.
 */
export function mapGeneratedParams(params: unknown): Record<string, unknown> | null {
  if (!Array.isArray(params)) {
    return null;
  }

  return params.reduce<Record<string, unknown>>((acc, param, index) => {
    if (!param || typeof param !== "object") {
      return acc;
    }

    const record = param as Record<string, unknown>;
    const value = record.value;
    if (value === undefined) {
      return acc;
    }

    acc[String(index + 1)] = value;

    const key =
      (typeof record.name === "string" && record.name.trim()) ||
      (typeof record.placeholder === "string" && record.placeholder.trim()) ||
      (typeof record.position === "number" && String(record.position)) ||
      String(index + 1);

    acc[key.replace(/[{}]/g, "").replace(/(.+):.*$/, "$1").replace(/^[:$]/, "").trim()] = value;
    return acc;
  }, {});
}
