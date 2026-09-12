export type PreviewKind = "markdown" | "image" | "unsupported";

export const DEFAULT_PROTECTED_EXTENSIONS = [
  "md",
  "avif",
  "bmp",
  "gif",
  "jpeg",
  "jpg",
  "png",
  "svg",
  "webp"
] as const;

const IMAGE_MIME_TYPES: Readonly<Record<string, string>> = {
  avif: "image/avif",
  bmp: "image/bmp",
  gif: "image/gif",
  jpeg: "image/jpeg",
  jpg: "image/jpeg",
  png: "image/png",
  svg: "image/svg+xml",
  webp: "image/webp"
};

export interface EncryptedFileType {
  originalName: string;
  originalPath: string;
  extension: string;
  kind: PreviewKind;
  mimeType?: string;
}

export function classifyAgePath(path: string): EncryptedFileType {
  const originalPath = path.toLowerCase().endsWith(".age") ? path.slice(0, -4) : path;
  const originalName = originalPath.split("/").pop() ?? originalPath;
  const extension = getExtension(originalName);

  if (extension === "md") {
    return { originalName, originalPath, extension, kind: "markdown" };
  }
  const mimeType = IMAGE_MIME_TYPES[extension];
  if (mimeType !== undefined) {
    return { originalName, originalPath, extension, kind: "image", mimeType };
  }
  return { originalName, originalPath, extension, kind: "unsupported" };
}

export function isProtectedPlainPath(
  path: string,
  protectedExtensions: readonly string[],
  configDir: string,
  excludedPaths: readonly string[] = []
): boolean {
  const normalizedConfigDir = configDir.replace(/^\/+|\/+$/g, "");
  if (
    (normalizedConfigDir.length > 0 &&
      (path === normalizedConfigDir || path.startsWith(`${normalizedConfigDir}/`))) ||
    path === ".ageconfig" ||
    path.toLowerCase().endsWith(".age") ||
    isExcludedVaultPath(path, excludedPaths)
  ) {
    return false;
  }
  return protectedExtensions.includes(getExtension(path));
}

export function isExcludedVaultPath(
  path: string,
  excludedPaths: readonly string[]
): boolean {
  return excludedPaths.some(
    (excluded) => path === excluded || path.startsWith(`${excluded}/`)
  );
}

export function isKnownImagePath(path: string): boolean {
  return IMAGE_MIME_TYPES[getExtension(path)] !== undefined;
}

export function normalizeExtensionList(input: string | readonly string[]): string[] {
  const values = typeof input === "string" ? input.split(/[\s,]+/) : input;
  const normalized = values
    .map((value) => value.trim().toLowerCase().replace(/^\.+/, ""))
    .filter((value) => value.length > 0 && value !== "age")
    .filter((value) => /^[a-z0-9][a-z0-9+_-]*$/.test(value));
  return [...new Set(normalized)].sort();
}

export function formatExtensionList(extensions: readonly string[]): string {
  return extensions.map((extension) => `.${extension}`).join(", ");
}

export function extractEmbeddedImageLinks(markdown: string): string[] {
  const links: string[] = [];
  const wikiEmbed = /!\[\[([^\]|#]+)(?:[#|][^\]]*)?\]\]/g;
  const markdownImage = /!\[[^\]]*\]\(\s*(?:<([^>]+)>|([^\s)]+))(?:\s+["'][^"']*["'])?\s*\)/g;

  for (const match of markdown.matchAll(wikiEmbed)) links.push(match[1].trim());
  for (const match of markdown.matchAll(markdownImage)) {
    const raw = (match[1] ?? match[2] ?? "").trim();
    if (!/^(?:https?:|data:|app:)/i.test(raw)) links.push(safeDecodeUri(raw));
  }
  return [...new Set(links)];
}

function getExtension(path: string): string {
  const name = path.split("/").pop() ?? path;
  const dot = name.lastIndexOf(".");
  return dot >= 0 ? name.slice(dot + 1).toLowerCase() : "";
}

function safeDecodeUri(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
