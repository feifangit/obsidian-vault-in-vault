import { readFile, writeFile } from "node:fs/promises";

const packageJson = JSON.parse(await readFile("package.json", "utf8"));
const manifest = JSON.parse(await readFile("manifest.json", "utf8"));
const versions = JSON.parse(await readFile("versions.json", "utf8"));

if (!/^\d+\.\d+\.\d+$/.test(packageJson.version)) {
  throw new Error(`Unsupported version: ${packageJson.version}`);
}

manifest.version = packageJson.version;
versions[packageJson.version] = manifest.minAppVersion;

await writeFile("manifest.json", `${JSON.stringify(manifest, null, 2)}\n`);
await writeFile("versions.json", `${JSON.stringify(versions, null, 2)}\n`);

console.log(`Updated manifest.json and versions.json to ${packageJson.version}.`);
