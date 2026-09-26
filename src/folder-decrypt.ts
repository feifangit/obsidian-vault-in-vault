import { classifyAgePath, isProtectedPlainPath } from "./file-types";

export interface FolderDecryptSelection {
  eligiblePaths: string[];
  skippedPaths: string[];
}

export function selectFolderAgePaths(
  paths: readonly string[],
  folderPath: string,
  protectedExtensions: readonly string[],
  configDir: string,
  excludedPaths: readonly string[] = []
): FolderDecryptSelection {
  const normalizedFolder = folderPath.replace(/^\/+|\/+$/g, "");
  const eligiblePaths: string[] = [];
  const skippedPaths: string[] = [];

  for (const path of paths) {
    if (!path.toLowerCase().endsWith(".age") || !isInsideFolder(path, normalizedFolder)) {
      continue;
    }
    const originalPath = classifyAgePath(path).originalPath;
    if (isProtectedPlainPath(originalPath, protectedExtensions, configDir, excludedPaths)) {
      eligiblePaths.push(path);
    } else {
      skippedPaths.push(path);
    }
  }

  eligiblePaths.sort((left, right) => left.localeCompare(right));
  skippedPaths.sort((left, right) => left.localeCompare(right));
  return { eligiblePaths, skippedPaths };
}

function isInsideFolder(path: string, normalizedFolder: string): boolean {
  return normalizedFolder.length === 0 || path.startsWith(`${normalizedFolder}/`);
}
