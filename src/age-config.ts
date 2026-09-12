import { DEFAULT_PROTECTED_EXTENSIONS } from "./file-types";
import { t } from "./i18n";

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
    throw new Error(t("config.invalidJson", { error: message }));
  }
  if (parsed === null || Array.isArray(parsed) || typeof parsed !== "object") {
    throw new Error(t("config.rootObject"));
  }

  const object = parsed as Record<string, unknown>;
  const unknown = Object.keys(object).filter(
    (key) => key !== "extensions" && key !== "exclude"
  );
  if (unknown.length > 0) {
    throw new Error(t("config.unknownField", { field: JSON.stringify(unknown[0]) }));
  }
  if (object.extensions !== undefined && !Array.isArray(object.extensions)) {
    throw new Error(t("config.extensionsArray"));
  }
  if (Array.isArray(object.extensions) && object.extensions.length === 0) {
    throw new Error(t("config.extensionsEmpty"));
  }
  const rawExtensions = object.extensions ?? DEFAULT_PROTECTED_EXTENSIONS;
  if (!(rawExtensions as readonly unknown[]).every((value) => typeof value === "string")) {
    throw new Error(t("config.extensionsStrings"));
  }

  const extensions = [
    ...new Set((rawExtensions as readonly string[]).map(validateAndNormalizeExtension))
  ].sort();

  if (object.exclude !== undefined && !Array.isArray(object.exclude)) {
    throw new Error(t("config.excludeArray"));
  }
  const rawExclude = object.exclude ?? [];
  if (!(rawExclude as unknown[]).every((value) => typeof value === "string")) {
    throw new Error(t("config.excludeStrings"));
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
    throw new Error(t("config.invalidExtension", { value: JSON.stringify(value) }));
  }
  if (!normalized.startsWith(".")) normalized = `.${normalized}`;
  if (
    normalized === "." ||
    normalized === ".age" ||
    normalized.includes("/") ||
    normalized.includes("\\") ||
    normalized.slice(1).includes(".")
  ) {
    throw new Error(t("config.invalidExtension", { value: JSON.stringify(value) }));
  }
  return normalized.slice(1);
}

function normalizeExcludePath(value: string): string {
  let path = value.trim().replace(/\\/g, "/");
  while (path.startsWith("./")) path = path.slice(2);
  if (path.endsWith("/")) path = path.slice(0, -1);

  if (path.length === 0) throw new Error(t("config.emptyExclude"));
  if (path.startsWith("/") || /^[a-z]:\//i.test(path)) {
    throw new Error(t("config.excludeRelative", { value: JSON.stringify(value) }));
  }
  if (path.includes("*") || path.includes("?") || path.includes("[") || path.includes("]")) {
    throw new Error(t("config.excludeGlob", { value: JSON.stringify(value) }));
  }
  if (path.split("/").some((part) => part === "" || part === "." || part === "..")) {
    throw new Error(t("config.invalidExclude", { value: JSON.stringify(value) }));
  }
  return path;
}
