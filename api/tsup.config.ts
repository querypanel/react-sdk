import { defineConfig } from "tsup";

export default defineConfig({
	entry: ["src/index.ts"],
	format: ["esm"],
	target: "node22",
	clean: true,
	bundle: true,
	splitting: false,
	treeshake: true,
	outDir: "dist",
	// Preserve .js extensions in output for proper ES module resolution
	outExtension: () => ({ js: ".js" }),
	// Bundle vega-lite to inline the JSON schema
	noExternal: ["vega-lite"],
	// pg is loaded dynamically at runtime for Postgres datasources; do not bundle
	// google-auth-library: bundling + dynamic import breaks OAuth2Client at runtime (Vercel)
	external: ["pg", "google-auth-library"],
	esbuildOptions(options) {
		// Inline JSON imports as JavaScript objects
		options.loader = {
			...options.loader,
			".json": "json",
		};
	},
});
