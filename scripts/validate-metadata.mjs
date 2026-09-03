import { readFile } from "node:fs/promises";

const packageJson = JSON.parse(await readFile("package.json", "utf8"));
const manifest = JSON.parse(await readFile("manifest.json", "utf8"));
const versions = JSON.parse(await readFile("versions.json", "utf8"));

const errors = [];
const semver = /^\d+\.\d+\.\d+$/;
const pluginId = /^[a-z]+(?:-[a-z]+)*$/;

if (packageJson.name !== manifest.id) {
  errors.push("package.json name must match manifest.json id.");
}
if (packageJson.version !== manifest.version) {
  errors.push("package.json and manifest.json versions must match.");
}
if (!semver.test(manifest.version)) {
  errors.push("manifest version must use x.y.z Semantic Versioning.");
}
if (!pluginId.test(manifest.id)) {
  errors.push("plugin id must contain lowercase letters and hyphens only.");
}
if (manifest.id.includes("obsidian") || manifest.id.endsWith("plugin")) {
  errors.push("plugin id cannot contain obsidian or end with plugin.");
}
if (manifest.description.length > 250 || !/[.?!)]$/.test(manifest.description)) {
  errors.push("manifest description must be at most 250 characters and end with punctuation.");
}
if (versions[manifest.version] !== manifest.minAppVersion) {
  errors.push("versions.json must map the current plugin version to minAppVersion.");
}

if (errors.length > 0) {
  for (const error of errors) console.error(`- ${error}`);
  process.exitCode = 1;
} else {
  console.log(`Metadata valid for ${manifest.name} ${manifest.version}.`);
}
