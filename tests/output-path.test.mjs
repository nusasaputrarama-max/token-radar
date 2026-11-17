import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, lstatSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { assertSafeCleanupTarget, safeOutputPath, verifyOutputDirTrusted } from '../lib/output-path.ts';

test('safeOutputPath permits a dedicated output directory inside the repository', () => {
  const root = mkdtempSync(join(tmpdir(), 'token-radar-path-'));
  try {
    const repo = join(root, 'repo');
    mkdirSync(repo);
    assert.equal(safeOutputPath(join(repo, 'out'), repo), join(repo, 'out'));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('safeOutputPath rejects the repository root and its ancestors', () => {
  const root = mkdtempSync(join(tmpdir(), 'token-radar-path-'));
  try {
    const repo = join(root, 'repo');
    mkdirSync(repo);
    assert.throws(() => safeOutputPath(repo, repo), /repository root and its ancestors/);
    assert.throws(() => safeOutputPath(root, repo), /repository root and its ancestors/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('safeOutputPath rejects symbolic-link path components', () => {
  const root = mkdtempSync(join(tmpdir(), 'token-radar-path-'));
  try {
    const repo = join(root, 'repo');
    mkdirSync(repo);
    const alias = join(root, 'repo-alias');
    symlinkSync(repo, alias, 'dir');
    assert.throws(() => safeOutputPath(join(alias, 'out'), repo), /symbolic link component/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('safeOutputPath rejects the filesystem root', () => {
  assert.throws(() => safeOutputPath('/', tmpdir()), /filesystem root/);
});

test('verifyOutputDirTrusted accepts a private owner-held directory', () => {
  const root = mkdtempSync(join(tmpdir(), 'token-radar-trust-'));
  try {
    const out = join(root, 'out');
    mkdirSync(out, { mode: 0o700 });
    assert.equal(verifyOutputDirTrusted(out), out);
    // 0755 (readable, not writable by group or others) is also trusted.
    chmodSync(out, 0o755);
    assert.equal(verifyOutputDirTrusted(out), out);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('verifyOutputDirTrusted rejects group/other-writable and symlinked directories', () => {
  const root = mkdtempSync(join(tmpdir(), 'token-radar-trust-'));
  try {
    const out = join(root, 'out');
    mkdirSync(out);
    chmodSync(out, 0o777);
    assert.throws(() => verifyOutputDirTrusted(out), /writable by group or others/);
    chmodSync(out, 0o770);
    assert.throws(() => verifyOutputDirTrusted(out), /writable by group or others/);
    chmodSync(out, 0o700);
    assert.equal(verifyOutputDirTrusted(out), out);
    const alias = join(root, 'out-alias');
    symlinkSync(out, alias, 'dir');
    assert.throws(() => verifyOutputDirTrusted(alias), /symbolic link/);
    assert.throws(() => verifyOutputDirTrusted(join(root, 'missing')), /does not exist yet/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('verifyOutputDirTrusted rejects an other-writable ancestor without the sticky bit, accepts a sticky one', () => {
  const root = mkdtempSync(join(tmpdir(), 'token-radar-trust-'));
  try {
    // A parent anyone can write into without the sticky bit lets another
    // local user replace a component with a symlink before cleanup.
    const shared = join(root, 'shared');
    mkdirSync(shared);
    chmodSync(shared, 0o777);
    const out = join(shared, 'out');
    mkdirSync(out, { mode: 0o700 });
    assert.throws(() => verifyOutputDirTrusted(out), /writable by others without the sticky bit/);
    // The sticky bit stops non-owners from replacing entries they do not
    // own, so the same parent with it set is trusted.
    chmodSync(shared, 0o1777);
    assert.equal(verifyOutputDirTrusted(out), out);
    // A group-writable ancestor (no other-write) is accepted too: the model
    // trusts the current user's own group, and the output directory itself
    // must still be private.
    chmodSync(shared, 0o770);
    assert.equal(verifyOutputDirTrusted(out), out);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('assertSafeCleanupTarget accepts real entries, ignores missing ones, rejects symlinks', () => {
  const root = mkdtempSync(join(tmpdir(), 'token-radar-cleanup-'));
  try {
    const out = join(root, 'out');
    mkdirSync(out);
    writeFileSync(join(out, 'board.json'), '{}');
    mkdirSync(join(out, 'dashboard'));
    assertSafeCleanupTarget(out, 'board.json');
    assertSafeCleanupTarget(out, 'dashboard');
    assertSafeCleanupTarget(out, 'missing.json');
    const outside = join(root, 'outside');
    mkdirSync(outside);
    symlinkSync(outside, join(out, 'screenshots'), 'dir');
    assert.throws(() => assertSafeCleanupTarget(out, 'screenshots'), /symbolic link/);
    symlinkSync(join(outside, 'board.json'), join(out, 'data.js'));
    assert.throws(() => assertSafeCleanupTarget(out, 'data.js'), /symbolic link/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

/** Adversarial race (audit v2.5 P2-02): a symlink swapped in after validation
 * must be caught by the check that runs immediately before deletion — the
 * path-shape check alone cannot see it, because the swap is inside the
 * output directory, not a component of the output path itself. */
test('adversarial race: a symlink swapped in after validation is caught by the per-entry check', () => {
  const root = mkdtempSync(join(tmpdir(), 'token-radar-race-'));
  try {
    const repo = join(root, 'repo');
    mkdirSync(repo);
    const out = join(repo, 'out');
    mkdirSync(out, { mode: 0o700 });
    mkdirSync(join(out, 'dashboard'));
    assert.equal(safeOutputPath(out, repo), out);
    assertSafeCleanupTarget(out, 'dashboard');
    // A concurrent writer replaces the dashboard directory with a symlink out.
    rmSync(join(out, 'dashboard'), { recursive: true });
    const elsewhere = join(root, 'elsewhere');
    mkdirSync(elsewhere);
    symlinkSync(elsewhere, join(out, 'dashboard'), 'dir');
    // The path-shape check still passes: the swap is inside out, not on its path.
    assert.equal(safeOutputPath(out, repo), out);
    // The directory-trust check also passes: it validates out and its
    // ancestors, not the entries inside out. Only the per-entry check
    // immediately before deletion can see this swap — and it catches it.
    assert.equal(verifyOutputDirTrusted(out), out);
    assert.throws(() => assertSafeCleanupTarget(out, 'dashboard'), /symbolic link/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

/** The same race on a path component: swapping an ancestor after the first
 * validation must fail the re-validation that runs after directory creation. */
test('adversarial race: a swapped ancestor component fails re-validation', () => {
  const root = mkdtempSync(join(tmpdir(), 'token-radar-race-'));
  try {
    const repo = join(root, 'repo');
    mkdirSync(repo);
    const out = join(repo, 'a', 'out');
    mkdirSync(join(repo, 'a'));
    mkdirSync(out, { mode: 0o700 });
    assert.equal(safeOutputPath(out, repo), out);
    rmSync(join(repo, 'a'), { recursive: true });
    const elsewhere = join(root, 'elsewhere');
    mkdirSync(elsewhere);
    mkdirSync(join(elsewhere, 'out'));
    symlinkSync(elsewhere, join(repo, 'a'), 'dir');
    assert.throws(() => safeOutputPath(out, repo), /symbolic link component/);
    assert.throws(() => verifyOutputDirTrusted(out), /resolves elsewhere/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
