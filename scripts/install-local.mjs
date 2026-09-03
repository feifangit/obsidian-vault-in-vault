import { copyFile, mkdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

const vaultArgument = process.argv[2];
if (vaultArgument === undefined) {
  throw new Error('Usage: npm run install:vault -- "/absolute/path/to/vault"');
}

const vaultPath = path.resolve(vaultArgument);
const configPath = path.join(vaultPath, ".obsidian");

try {
  if (!(await stat(configPath)).isDirectory()) throw new Error("not a directory");
} catch {
  throw new Error(`${vaultPath} does not contain an .obsidian directory.`);
}

const manifest = JSON.parse(await readFile("manifest.json", "utf8"));
const destination = path.join(configPath, "plugins", manifest.id);
await mkdir(destination, { recursive: true });

for (const asset of ["main.js", "manifest.json", "styles.css"]) {
  await copyFile(asset, path.join(destination, asset));
}

console.log(`Installed ${manifest.name} ${manifest.version} in ${destination}`);
