import esbuild from "esbuild";

// The renderer is imported from ../templates, not copied. One implementation of
// the map, bundled into two hosts.
const opts = {
  entryPoints: ["src/main.ts"],
  bundle: true,
  external: ["obsidian", "electron", "child_process", "path", "fs"],
  format: "cjs",
  target: "es2020",
  outfile: "main.js",
  sourcemap: process.argv.includes("--watch") ? "inline" : false,
  logLevel: "info",
};

if (process.argv.includes("--watch")) {
  const ctx = await esbuild.context(opts);
  await ctx.watch();
} else {
  await esbuild.build(opts);
}
