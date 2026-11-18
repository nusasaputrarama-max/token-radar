# Output-path threat model — Token Radar

**Scope:** the generated-output cleanup in `main.ts`, guarded by
`lib/output-path.ts`. Written for audit v2.6 P2 (follow-up to the v2.5 P2-02
guard). This document states what the guard guarantees, what it assumes, and
what it does **not** claim. It does not change any code.

## What the guard guarantees

Protection against **static unsafe paths**: the output directory may not be
the filesystem root, the repository root or any of its ancestors, and no
existing path component may be a symlink (`safeOutputPath`). A created
output directory must be a real directory owned by the current user, not
writable by *others*, under parents no *other* local user can swap a
component in (`verifyOutputDirTrusted`). Each cleanup target is re-validated
immediately before its own deletion (`assertSafeCleanupTarget`).

## Adversary

A **local process with write access to a parent directory** of the output
path. It can replace a checked component with a symlink between validation
and deletion. There is **no remote attacker** in this model: the snapshot is
sealed, the run is local, and the dashboard is static with no network.
A privileged attacker (root, or the owner of a parent directory) is out of
scope: path-based checks cannot defend against one.

## Trusted-parent assumption (the assumption this design rests on)

The run's parent directories are **not writable by untrusted local
processes**, except where the sticky bit protects them. Concretely:

- An *other*-writable parent without the sticky bit fails the run closed:
  any other local user could replace a component there with a symlink.
- A sticky-bit parent is accepted: it stops non-owners from unlinking or
  replacing entries they do not own.
- **Group-writable paths are accepted** on the assumption that the current
  user's own group is trusted (calibration `8d071f7`: the repository's own
  `scripts/rebuild.sh` pre-creates its run directories with `mkdir -p`
  under a group-writable umask, 0770, and a caller that pre-creates the
  output directory with default modes must keep working). On a machine
  where the group is shared with untrusted users, run under a private
  parent and a private output directory.

`main.ts` still creates newly-made output directories private (mode 0700);
only pre-created directories fall under the group-trust assumption.

## Residual race (stated plainly, not fixed by this design)

Path-based checks **cannot atomically close the window between the final
per-entry check and its `rmSync`**. `assertSafeCleanupTarget` re-validates a
target immediately before deletion, which narrows the window to one entry at
a time, but a process that swaps a component in that exact interval is not
caught by any check in this design. The existing adversarial tests
(`tests/output-path.test.mjs`) swap a component **before** the final
per-entry check, so they prove the check catches a swap — they do **not**
exercise a concurrent swap after the check, and no test in this repository
claims to.

Do not describe this guard as race-free, atomic, or a symlink-race defence.
It is protection against static unsafe paths plus a fail-closed check
immediately before each deletion.

## Operational guidance

- Prefer a private, newly created output directory under a parent not
  writable by untrusted processes. `main.ts` creates one private (0700)
  when it creates the directory itself.
- Do not run the cleanup against an output directory under a shared
  world-writable parent, or under a group shared with untrusted users,
  without first making the parent private.
- If a check fails, the run exits without deleting anything: fail-closed is
  the intended outcome, not an error to work around by widening permissions.

## What a stronger guarantee would need

Closing the residual window would need a design whose guarantees match the
threat model: descriptor-relative cleanup (`openat`/`unlinkat` on a held
directory descriptor, never re-resolving a path), or performing the cleanup
inside a private directory created by the run itself and never shared. That
is future work; this document records the gap rather than claiming it.
