import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  target: "node20",
  platform: "node",
  clean: true,
  dts: false,
  sourcemap: true,
  // The bin must be directly executable.
  banner: { js: "#!/usr/bin/env node" },
});
