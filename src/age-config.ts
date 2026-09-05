import { DEFAULT_PROTECTED_EXTENSIONS } from "./file-types";

export const AGE_CONFIG_PATH = ".ageconfig";

export interface AgeConfigPolicy {
  extensions: string[];
  exclude: string[];
}

export function parseAgeConfig(contents: string): AgeConfigPolicy {
  let parsed: unknown;
  try {
    parsed = JSON.parse(contents);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`invalid JSON: ${message}`);
  }
  if (parsed === null || Array.isArray(parsed) || typeof parsed !== "object") {
    throw new Error("the root must be a JSON object");
  }

  const object = parsed as Record<string, unknown>;
  const unknown = Object.keys(object).filter(
    (key) => key !== "extensions" && key !== "exclude"
  );
  if (unknown.length > 0) {
    throw new Error(`unknown field ${JSON.stringify(unknown[0])}`);
  }
  if (object.extensions !== undefined && !Array.isArray(object.extensions)) {
    throw new Error("extensions must be an array of file extensions");
  }
  if (Array.isArray(object.extensions) && object.extensions.length === 0) {
    throw new Error("extensions must contain at least one file extension");
  }
  const rawExtensions = object.extensions ?? DEFAULT_PROTECTED_EXTENSIONS;
  if (!(rawExtensions as readonly unknown[]).every((value) => typeof value === "string")) {
    throw new Error("extensions must contain only strings");
  }

  const extensions = [
    ...new Set((rawExtensions as readonly string[]).map(validateAndNormalizeExtension))
  ].sort();

  if (object.exclude !== undefined && !Array.isArray(object.exclude)) {
    throw new Error("exclude must be an array of relative paths");
  }
  const rawExclude = object.exclude ?? [];
  if (!(rawExclude as unknown[]).every((value) => typeof value === "string")) {
    throw new Error("exclude must contain only strings");
  }

  return {
    extensions,
    exclude: normalizeExcludeList(rawExclude as string[])
  };
}

export function normalizeExcludeList(input: string | readonly string[]): string[] {
  const values = typeof input === "string"
    ? input.split(/[\n,]+/).filter((value) => value.trim().length > 0)
    : input;
  const normalized = values.map(normalizeExcludePath);
  return [...new Set(normalized)].sort();
}

function validateAndNormalizeExtension(value: string): string {
  let normalized = value.trim().toLowerCase();
  if (normalized === "all" || normalized === "*") {
    throw new Error(`invalid file extension ${JSON.stringify(value)}`);
  }
  if (!normalized.startsWith(".")) normalized = `.${normalized}`;
  if (
    normalized === "." ||
    normalized === ".age" ||
    normalized.includes("/") ||
    normalized.includes("\\") ||
    normalized.slice(1).includes(".")
  ) {
    throw new Error(`invalid file extension ${JSON.stringify(value)}`);
  }
  return normalized.slice(1);
}

function normalizeExcludePath(value: string): string {
  let path = value.trim().replace(/\\/g, "/");
  while (path.startsWith("./")) path = path.slice(2);
  if (path.endsWith("/")) path = path.slice(0, -1);

  if (path.length === 0) throw new Error("exclude cannot contain an empty path");
  if (path.startsWith("/") || /^[a-z]:\//i.test(path)) {
    throw new Error(`exclude path ${JSON.stringify(value)} must be relative to the vault`);
  }
  if (path.includes("*") || path.includes("?") || path.includes("[") || path.includes("]")) {
    throw new Error(`exclude path ${JSON.stringify(value)} cannot contain glob characters`);
  }
  if (path.split("/").some((part) => part === "" || part === "." || part === "..")) {
    throw new Error(`invalid exclude path ${JSON.stringify(value)}`);
  }
  return path;
}
