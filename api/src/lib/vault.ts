import { supabase } from "./supabase";
import { createLogger } from "./logger";

const logger = createLogger("vault");

/**
 * Retrieves a secret from Supabase Vault (pgsodium) via the get_secret RPC.
 * Used to resolve datasource passwords stored by password_secret_id.
 */
export async function getVaultSecret(secretId: string): Promise<string> {
	if (!secretId?.trim()) {
		return "";
	}
	const { data, error } = await supabase.rpc("get_secret", {
		secret_id: secretId,
	});
	if (error) {
		logger.error({ error, secretId: "(redacted)" }, "Failed to retrieve vault secret");
		throw new Error("Failed to retrieve password from vault");
	}
	return (data as string) ?? "";
}
