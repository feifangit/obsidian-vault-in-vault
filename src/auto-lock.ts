export interface AutoLockFailure<File> {
  file: File;
  error: unknown;
}

export interface AutoLockBatchResult<File> {
  completed: number;
  total: number;
  failures: AutoLockFailure<File>[];
}

export async function runAutoLockBatch<File>(options: {
  prepare: () => Promise<readonly File[]>;
  protect: (file: File) => Promise<void>;
  afterProtected: (file: File, completed: number, total: number) => void;
}): Promise<AutoLockBatchResult<File>> {
  // prepare is deliberately all-or-nothing: policy validation and editor saves
  // must finish before the first file can be replaced.
  const files = await options.prepare();
  const failures: AutoLockFailure<File>[] = [];
  let completed = 0;

  for (const file of files) {
    try {
      await options.protect(file);
      completed++;
      options.afterProtected(file, completed, files.length);
    } catch (error) {
      failures.push({ file, error });
    }
  }

  return { completed, total: files.length, failures };
}
