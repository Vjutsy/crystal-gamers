// Bundles the server (including @cg/shared TypeScript sources) into dist/index.js.
// npm dependencies stay external and are installed normally in production.
import { readFileSync } from "node:fs";
import { build } from "esbuild";

const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"));
const external = Object.keys(pkg.dependencies ?? {}).filter((name) => !name.startsWith("@cg/"));

await build({
  entryPoints: ["src/index.ts"],
  outfile: "dist/index.js",
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  sourcemap: true,
  external,
});
console.log("server built → dist/index.js");
