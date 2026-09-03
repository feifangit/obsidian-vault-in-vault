export function findClosedFilePaths<Leaf>(
  previous: ReadonlyMap<Leaf, string>,
  current: ReadonlyMap<Leaf, string>
): string[] {
  const stillOpen = new Set(current.values());
  const closed = new Set<string>();

  for (const [leaf, path] of previous) {
    // A leaf changing to another file is navigation, not a tab close.
    if (current.has(leaf)) continue;
    // Do not protect a file that is still visible in another leaf.
    if (stillOpen.has(path)) continue;
    closed.add(path);
  }

  return [...closed];
}
