import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    "themes/index": "src/themes/index.ts",
  },
  format: ["cjs", "esm"],
  dts: true,
  splitting: false,
  sourcemap: true,
  clean: true,
  external: ["react", "react-dom"],
  treeshake: true,
  // tsup extracts CSS to dist/index.css; hosts only get it if JS imports that file.
  onSuccess: "node scripts/inject-css-import.mjs",
});
