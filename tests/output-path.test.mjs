import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { safeOutputPath } from '../lib/output-path.ts';

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
