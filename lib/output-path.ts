import { lstatSync, realpathSync, statSync, type Stats } from 'node:fs';
import { join, parse, resolve, sep } from 'node:path';

/**
 * Resolve and validate the generated-output directory before recursive cleanup.
 * The output may live inside the repository (for local development), but it may
 * not be the repository itself, an ancestor of it, a filesystem root, or a path
 * that traverses a symbolic link.
 *
 * Threat model (audit v2.5 P2-02). The cleanup in main.ts deletes generated
 * paths recursively, so a path that escapes the output directory would delete
 * outside it. The adversary is a local process with write access to a parent
 * directory of the output path: it can replace a checked component with a
 * symlink between validation and deletion. There is no remote attacker here —
 * the snapshot is sealed and the run is local — but a shared parent (a
 * world-writable directory, a group-writable directory shared with untrusted
 * users) is enough. The defence is layered and fail-closed:
 *
 * 1. `safeOutputPath` rejects unsafe shapes (filesystem root, repository root
 *    and ancestors, any symlinked component) before the directory is created
 *    and again right after creation.
 * 2. main.ts creates newly-made output directories private (mode 0700).
 * 3. `verifyOutputDirTrusted` (below) requires the created directory to be a
 *    real directory owned by the current user and not writable by *others*,
 *    and requires every existing ancestor's parent to be unwritable by
 *    *others* unless the sticky bit protects it. Group-writable paths are
 *    accepted: the model trusts the current user's own group — a caller that
 *    pre-creates the output directory with default modes under a
 *    group-writable umask (the repository's own `scripts/rebuild.sh` does
 *    this) must keep working. On a machine where the group is shared with
 *    untrusted users, run under a private parent and a private output
 *    directory.
 * 4. `assertSafeCleanupTarget` re-validates each cleanup target immediately
 *    before its own deletion, so a swap after validation is caught, not
 *    followed.
 *
 * Residual risk, stated plainly: path-based checks cannot atomically close
 * the window between the final per-entry check and its `rmSync`, and they
 * cannot defend against a privileged attacker or an owner of a parent
 * directory. The design narrows the window to one entry at a time and fails
 * closed on every checkable condition; it does not claim to eliminate all
 * symlink-redirection races. The full threat model, including the
 * trusted-parent and group-trust assumptions and what a stronger guarantee
 * would need, is in `docs/output-path-threat-model.md` (audit v2.6 P2).
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

/**
 * Fail closed unless the output directory is an owner-held directory under
 * parents no untrusted local writer can swap a component in. Call after the
 * directory exists (main.ts creates it private first). Throws on: a missing
 * or non-directory path, a symlinked final component or ancestor (the
 * resolved path must equal the lexical path), ownership by another user,
 * *other* write permission on the directory itself, or any existing ancestor
 * component whose parent is writable by *others* without the sticky bit —
 * such a parent would let any other local user replace the component with a
 * symlink before cleanup runs. A sticky-bit parent is accepted: it stops
 * non-owners from unlinking or replacing entries they do not own, so a swap
 * of an existing component is blocked there. Group-writable paths are
 * accepted (the current user's own group is trusted — callers that pre-create
 * the output directory with default modes under a group-writable umask must
 * keep working); on a machine where the group is shared with untrusted
 * users, run under a private parent and a private output directory.
 */
export function verifyOutputDirTrusted(outputPath: string): string {
  const output = resolve(outputPath);
  let st: Stats;
  try {
    st = lstatSync(output);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error(`unsafe output path: ${output} does not exist yet`);
    }
    throw error;
  }
  if (st.isSymbolicLink()) throw new Error(`unsafe output path: symbolic link ${output}`);
  if (!st.isDirectory()) throw new Error(`unsafe output path: ${output} is not a directory`);
  if (realpathSync(output) !== output) {
    throw new Error(`unsafe output path: ${output} resolves elsewhere`);
  }
  if (typeof process.getuid === 'function' && st.uid !== process.getuid()) {
    throw new Error(`unsafe output path: ${output} is not owned by the current user`);
  }
  if ((st.mode & 0o002) !== 0) {
    throw new Error(`unsafe output path: ${output} is writable by others`);
  }
  const root = parse(output).root;
  let current = root;
  for (const part of output.slice(root.length).split(sep).filter(Boolean)) {
    const parent = current;
    current = resolve(current, part);
    let parentStat: Stats;
    try {
      parentStat = statSync(parent);
    } catch {
      break;
    }
    if ((parentStat.mode & 0o002) !== 0 && (parentStat.mode & 0o1000) === 0) {
      throw new Error(`unsafe output path: parent ${parent} is writable by others without the sticky bit`);
    }
  }
  return output;
}

/**
 * Assert that one cleanup target inside the output directory is safe to delete
 * right now: it must be a real file or directory (never a symlink) whose
 * resolved path stays inside the resolved output directory. A missing target
 * is fine (nothing stale to remove). Call this immediately before the matching
 * rmSync: it is the last check before deletion, so a path swapped in after
 * validation is caught here, not followed into the cleanup.
 */
export function assertSafeCleanupTarget(output: string, name: string): void {
  const target = join(output, name);
  let st: Stats;
  try {
    st = lstatSync(target);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
    throw error;
  }
  if (st.isSymbolicLink()) {
    throw new Error(`unsafe cleanup target: symbolic link ${target}`);
  }
  const realOut = realpathSync(output);
  const realTarget = realpathSync(target);
  if (realTarget !== realOut && !realTarget.startsWith(realOut + sep)) {
    throw new Error(`unsafe cleanup target: ${target} resolves outside the output directory`);
  }
}
