import { cp, mkdir, rm } from "node:fs/promises";
import * as esbuild from "esbuild";

const watch = process.argv.includes("--watch");
const outdir = "dist";

await rm(outdir, { force: true, recursive: true });
await mkdir(`${outdir}/scripts`, { recursive: true });
await cp("src/manifest.json", `${outdir}/manifest.json`);
await cp("src/icons", `${outdir}/icons`, { recursive: true });

const options = {
  bundle: true,
  entryPoints: ["src/content/index.ts"],
  format: "iife",
  legalComments: "none",
  minify: !watch,
  outfile: `${outdir}/scripts/content.js`,
  target: "chrome110",
};

if (watch) {
  const ctx = await esbuild.context(options);
  await ctx.watch();
  console.log("watching src...");
} else {
  await esbuild.build(options);
  console.log(`built ${outdir}/`);
}
