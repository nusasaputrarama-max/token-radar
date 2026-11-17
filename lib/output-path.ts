import { lstatSync, realpathSync } from 'node:fs';
import { parse, resolve, sep } from 'node:path';

/**
 * Resolve and validate the generated-output directory before recursive cleanup.
 * The output may live inside the repository (for local development), but it may
 * not be the repository itself, an ancestor of it, a filesystem root, or a path
 * that traverses a symbolic link.
 */
export function safeOutputPath(outputPath: string, repositoryRoot: string): string {
  const output = resolve(outputPath);
  const repository = realpathSync(repositoryRoot);
  const filesystemRoot = parse(output).root;

  if (output === filesystemRoot) {
    throw new Error('unsafe output path: filesystem root is not allowed');
  }
  if (output === repository || repository.startsWith(output + sep)) {
    throw new Error('unsafe output path: repository root and its ancestors are not allowed');
  }

  // Reject symlinks in every existing path component. Checking only the final
  // directory would miss an ancestor symlink that redirects cleanup elsewhere.
  const root = parse(output).root;
  let current = root;
  for (const part of output.slice(root.length).split(sep).filter(Boolean)) {
    current = resolve(current, part);
    try {
      if (lstatSync(current).isSymbolicLink()) {
        throw new Error(`unsafe output path: symbolic link component ${current}`);
      }
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('unsafe output path:')) throw error;
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') break;
      throw error;
    }
  }

  return output;
}
