import { createWriteStream } from "node:fs";
import { readFile } from "node:fs/promises";
import archiver from "archiver";

const { version } = JSON.parse(await readFile("src/manifest.json", "utf8"));
const out = `rich-telegram-ads-${version}.zip`;

const archive = archiver("zip", { zlib: { level: 9 } });
archive.pipe(createWriteStream(out));
archive.directory("dist/", false);
await archive.finalize();

console.log(`packed ${out}`);
