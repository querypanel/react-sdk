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
  // d3-geo (and its d3-array) ship ESM only; bundling them keeps the CJS build free of requires that fail
  // on Node versions without require(esm), and consumers install nothing extra for the map.
  noExternal: ["d3-geo", "topojson-client"],
  treeshake: true,
  // tsup extracts CSS to dist/index.css; hosts only get it if JS imports that file.
  onSuccess: "node scripts/inject-css-import.mjs",
});
